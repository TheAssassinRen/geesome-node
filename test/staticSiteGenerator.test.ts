/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import assert from "assert";
import IGeesomeStaticSiteGeneratorModule from "../app/modules/staticSiteGenerator/interface.js";
import {ContentView, CorePermissionName, IUser} from "../app/modules/database/interface.js";
import ssgHelpers from '../app/modules/staticSiteGenerator/helpers.js';
import {IGroup, PostStatus} from "../app/modules/group/interface.js";
import resourcesHelper from './helpers/resources.js';
import {IGeesomeApp} from "../app/interface.js";
const {getTitleAndDescription} = ssgHelpers;

describe("staticSiteGenerator", function () {
	this.timeout(60000);

	let app: IGeesomeApp, staticSiteGenerator: IGeesomeStaticSiteGeneratorModule, testUser: IUser, testGroup: IGroup;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();

			await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
			testUser = await app.registerUser({
				email: 'user@user.com',
				name: 'user',
				password: 'user',
				permissions: [CorePermissionName.UserAll]
			});
			testGroup = await app.ms.group.createGroup(testUser.id, {
				name: 'test',
				title: 'Test'
			});
			staticSiteGenerator = app.ms['staticSiteGenerator'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('title and description should working properly', async () => {
		const text = 'Кто плюсист?<br><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br><br><i>Language<br>concepts[6], with terse syntax.[7]<br>modules[8]<br><br>Library<br>ranges (The One Ranges Proposal)[35]</i>';
		const {title, description} = getTitleAndDescription([{view: 'contents', text}], {
			titleLength: 66,
			descriptionLength: 156
		})
		assert.equal(title, 'Кто плюсист? https://en.wikipedia.org/wiki/C%2B%2B20');
		assert.equal(description, '<i>Language<br/>concepts[6], with terse syntax.[7]<br/>modules[8]<br/>Library<br/>ranges (The One Ranges Proposal)[35]</i>');
	});

	it('zero title and description should working properly', async () => {
		const text = 'Кто плюсист?<br><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br><br><i>Language<br>concepts[6], with terse syntax.[7]<br>modules[8]<br><br>Library<br>ranges (The One Ranges Proposal)[35]</i>';
		const {title, description} = getTitleAndDescription([{view: 'contents', text}], {
			titleLength: 0,
			descriptionLength: 156
		})
		assert.equal(title, '');
		assert.equal(description, 'Кто плюсист?<br/><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br/><i>Language<br/>concepts[6], with terse syntax.[7]...</i>');
	});

	it('should generate site correctly from group', async () => {
		const posts = [];
		for(let i = 0; i < 30; i++) {
			const post1Content = await app.ms.content.saveData(testUser.id, 'Hello world' + i, null, { mimeType: 'text/markdown' });

			console.log('post1Content ls', await app.ms.storage.nodeLs(post1Content.storageId));
			const pngImagePath = await resourcesHelper.prepare('input-image.png');
			console.log('imageContent', i);
			const imageContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(pngImagePath), 'input-image.png', {
				groupId: testGroup.id,
				waitForPin: true
			});
			console.log('imageContent ls', await app.ms.storage.nodeLs(imageContent.storageId));
			console.log('postData', i);
			const postData = {
				contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Contents},{manifestStorageId: imageContent.manifestStorageId, view: ContentView.Media}],
				groupId: testGroup.id,
				status: PostStatus.Published
			};
			console.log('createPost', i);
			posts.push(await app.ms.group.createPost(testUser.id, postData));
		}

		console.log('generateGroupSite 1');
		const site = {
			title: 'MySite',
			name: 'my_site',
			description: 'My About',
			username: 'myusername',
			base: '/'
		};
		const directoryStorageId = await staticSiteGenerator.generateGroupSite(testUser.id, {entityType: 'group', entityId: testGroup.id}, {
			lang: 'en',
			dateFormat: 'DD.MM.YYYY hh:mm:ss',
			baseStorageUri: 'http://localhost:2052/ipfs/',
			post: {
				titleLength: 0,
				descriptionLength: 400,
			},
			postList: {
				postsPerPage: 5,
			},
			site
		});
		console.log('generateGroupSite 2');

		const indexHtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/index.html`).then(b => b.toString('utf8'));
		assert.match(indexHtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.match(indexHtmlContent, /post-intro.+Hello world25/);
		assert.match(indexHtmlContent, /MySite/);
		assert.match(indexHtmlContent, /My About/);
		assert.match(indexHtmlContent, /Posts: 30/);
		assert.equal(indexHtmlContent.includes('<link rel="stylesheet" href="./style.css">'), true);
		assert.equal(indexHtmlContent.includes('<a href="./post/26/"'), true);
		const page3HtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/page/5/index.html`).then(b => b.toString('utf8'));
		assert.match(page3HtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.match(page3HtmlContent, /post-intro.+Hello world24/);
		assert.equal(page3HtmlContent.includes('<link rel="stylesheet" href="../../style.css">'), true);
		assert.equal(page3HtmlContent.includes('<a href="../../page/5/"'), true);
		assert.equal(page3HtmlContent.includes('<a href="../../post/24/"'), true);
		const postHtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/post/${posts[0].id}/index.html`).then(b => b.toString('utf8'));
		assert.match(postHtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.match(postHtmlContent, /post-page-content.+Hello world0/);
		assert.equal(postHtmlContent.includes('<link rel="stylesheet" href="../../style.css">'), true);
		console.log('postHtmlContent', postHtmlContent);

		const [gotStaticSiteInfo] = await staticSiteGenerator.getStaticSiteList(testUser.id, 'group', {limit: 10, sortBy: 'createdAt', sortDir: 'DESC'});
		assert.equal(gotStaticSiteInfo.title, site.title);
		assert.equal(gotStaticSiteInfo.name, site.name);

		assert.equal(await staticSiteGenerator.isStorageIdAllowed(directoryStorageId), true);
		assert.equal(await app.callHookCheckAllowed('content', 'isStorageIdAllowed', [directoryStorageId]), true);
	});

	it('should generate site correctly from content list', async () => {
		const contentIds = [];
		for (let i = 0; i < 30; i++) {
			const pngImagePath = await resourcesHelper.prepare('input-image.png');
			const imageContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(pngImagePath), 'input-image.png', {
				groupId: testGroup.id,
				waitForPin: true
			});
			contentIds.push(imageContent.id);
		}

		console.log('generateContentsSite 1');
		const directoryStorageId = await staticSiteGenerator.generateContentListSite(testUser.id, {entityType: 'content-list', entityIds: contentIds}, {
			lang: 'en',
			dateFormat: 'DD.MM.YYYY hh:mm:ss',
			baseStorageUri: 'http://localhost:2052/ipfs/',
			post: {
				titleLength: 0,
				descriptionLength: 400,
			},
			postList: {
				postsPerPage: 5,
			},
			site: {
				title: 'MySite',
				name: 'my_content_site',
				description: 'My About',
				username: 'myusername',
				base: '/'
			}
		});
		console.log('generateContentsSite 2', directoryStorageId);
		console.log('ls', await app.ms.storage.nodeLs(directoryStorageId));
		console.log('ls content', await app.ms.storage.nodeLs(directoryStorageId + '/content'));

		const indexHtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/index.html`).then(b => b.toString('utf8'));
		assert.match(indexHtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.equal(indexHtmlContent.includes('class="content-item'), true);
		assert.equal(indexHtmlContent.includes('<link rel="stylesheet" href="./style.css">'), true);
		assert.equal(indexHtmlContent.includes('<img src="./content/bafk'), true);
		console.log('indexHtmlContent', indexHtmlContent);
	});
});