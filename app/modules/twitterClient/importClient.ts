import IGeesomeSocNetImport, {IGeesomeSocNetImportClient, ISocNetDbChannel} from "../socNetImport/interface";
import IGeesomeTwitterClient from "./interface";
import {IPost} from "../group/interface";
import {ContentView} from "../database/interface";
import IGeesomeContentModule from "../content/interface";

const pIteration = require('p-iteration');

const {getReplyToId, getRetweetId, clearMessageFromMediaMessages} = require('./helpers');

export class TwitterImportClient implements IGeesomeSocNetImportClient {
	socNet = 'twitter';
	userId: number;
	dbChannel: ISocNetDbChannel;
	advancedSettings: {fromMessage, toMessage, mergeSeconds, force};
	messages: {list, authorById, mediasByKey, tweetsById, usersById};

	connectClient;
	twitterClient: IGeesomeTwitterClient;
	socNetImport: IGeesomeSocNetImport;
	content: IGeesomeContentModule;
	onRemotePostProcess: (m: any, post: IPost, type: any) => any;
	authorById: {};
	msgLinkTplByAccountId = {};
	channelByAuthorId = {};
	messagesById = {};

	constructor(_app, _connectClient, _userId, _dbChannel, _messages, _advancedSettings, _onRemotePostProcess) {
		this.connectClient = _connectClient;

		this.twitterClient = _app.ms.twitterClient;
		this.socNetImport = _app.ms.socNetImport;
		this.content = _app.ms.content;

		this.userId = _userId;
		this.dbChannel = _dbChannel;
		this.messages = _messages;
		this.authorById = _messages.authorById;
		this.advancedSettings = _advancedSettings;
		this.onRemotePostProcess = _onRemotePostProcess;
	}

	async getRemotePostLink(_channel, msgId) {
		return `https://twitter.com/${_channel.username}/${msgId}`;
	}
	getRemotePostReplyToMsgId(m) {
		return getReplyToId(m)
	}
	getRemotePostRepostOfMsgId(m) {
		return getRetweetId(m)
	}
	async getRemotePostDbChannel (m, type) {
		let authorId = m.author_id, authorObj = m.author;
		if (!this.channelByAuthorId[m.author_id]) {
			if (type === 'reply') {
				authorId = m.in_reply_to_user_id;
				authorObj = this.authorById[authorId];
			} else if (type === 'repost') {
				console.log('getRemotePostDbChannel', type, m);
				authorId = m.repost_of_user_id;
				authorObj = this.authorById[authorId];
			}
			if (!authorId) {
				return null;
			}
			if (!authorObj) {
				authorObj = await this.twitterClient.getChannelInfoByClient(this.connectClient, authorId);
			}
			this.channelByAuthorId[authorId] = await this.twitterClient.storeChannelToDb(this.userId, authorObj, this.dbChannel.accountId !== authorId);
		}
		return this.channelByAuthorId[authorId];
	}
	async getRemotePostContents (dbChannel, m, type) {
		return this.messageToContents(this.userId, dbChannel, m, type);
	}
	async getRemotePostProperties(userId, dbChannel, m) {
		//TODO: get forward from username and id
		return {};
	}
	async getReplyMessage(dbChannel, m) {
		const refReply = (m.referenced_tweets || []).filter(t => t.type === 'replied_to')[0];
		if (!refReply) {
			return null;
		}
		if (this.messages.tweetsById[refReply.id]) {
			return this.messages.tweetsById[refReply.id];
		}
		return null;
	}
	async getRepostMessage(dbChannel, m) {
		const retweetRef = (m.referenced_tweets || []).filter(t => t.type === 'retweeted')[0];
		if (!retweetRef) {
			return null;
		}
		if (this.messages.tweetsById[retweetRef.id]) {
			return this.messages.tweetsById[retweetRef.id];
		}
		return null;
	}
	async messageToContents(userId, dbChannel, m, type?) {
		const contentMessageData = {userId, msgId: m.id, dbChannelId: dbChannel.id};
		let {entities, text} = m;
		if (entities) {
			text = clearMessageFromMediaMessages(m);
		}
		let textContent;
		if (text) {
			textContent = await this.content.saveData(userId, text, 'tw-' + m.id, {
				mimeType: 'text/html',
				view: ContentView.Contents
			});
			await this.socNetImport.storeContentMessage(contentMessageData, textContent);
		}
		return pIteration
			.map(m.medias, async (media) => {
				const content = await this.twitterClient.saveMedia(userId, media);
				await this.socNetImport.storeContentMessage(contentMessageData, content);
				return content;
			})
			.then(list => [textContent].concat(list).filter(c => c));
	}
}