import {IGeesomeApp} from "../../interface";
import IGeesomeStaticSiteGeneratorModule, {IStaticSite} from "./interface";

const base = '/';
const pIteration = require('p-iteration');
const _ = require('lodash');
const commonHelper = require('geesome-libs/src/common');
let helpers = require('../../helpers');
const {getPostTitleAndDescription, getOgHeaders} = require('./helpers');

module.exports = async (app: IGeesomeApp) => {
    // VueSSR: import JS [type: module] (by workspaces in package.json)
    const {default: {prepareRender}} = await import('static-site-pkg');
    app.checkModules(['asyncOperation', 'group', 'content']);
    const module = getModule(app, await require('./models')(), prepareRender);
    require('./api')(app, module);
    return module;
}

function getModule(app: IGeesomeApp, models, prepareRender) {
    let finishCallbacks = {

    };

    class StaticSiteGenerator implements IGeesomeStaticSiteGeneratorModule {
        moduleName = 'static-site-generator';

        async addRenderToQueueAndProcess(userId, userApiKeyId, renderData: {entityType, entityId?, entityIds?}, options) {
            const {entityType, entityId, entityIds} = renderData;
            if (entityType === 'group') {
                const isAdmin = await app.ms.group.isAdminInGroup(userId, entityId);
                if (!isAdmin) {
                    throw Error('not_enough_rights');
                }
            } else if (entityType === 'content-list') {
                if (!entityIds || !entityIds.length || entityIds.length > 9999) {
                    throw Error('invalid_entity_ids');
                }
            } else {
                throw Error('unknown_type');
            }
            if (options['name'] && !helpers.validateUsername(options['name'])) {
                throw new Error("incorrect_name");
            }

            const operationQueue = await app.ms.asyncOperation.addUserOperationQueue(userId, this.moduleName, userApiKeyId, {
                entityType,
                entityId,
                options
            });
            this.processQueue();
            return operationQueue;
        }

        async runRenderAndWaitForFinish(userId, apiKeyId, entityType, entityId, options) {
            const operationQueue = await this.addRenderToQueueAndProcess(userId, apiKeyId, {entityType, entityId}, options);
            const finishedOperation = await new Promise((resolve) => {
                finishCallbacks[operationQueue.id] = resolve;
            });
            delete finishCallbacks[operationQueue.id];
            return finishedOperation;
        }

        async processQueue() {
            const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(this.moduleName);
            // console.log('waitingQueue', waitingQueue);
            if (!waitingQueue) {
                return;
            }
            // console.log('waitingQueue.asyncOperation', waitingQueue.asyncOperation);
            if (waitingQueue.asyncOperation) {
                if (waitingQueue.asyncOperation.inProcess) {
                    console.log('return');
                    return;
                } else {
                    await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(waitingQueue.asyncOperation.id);
                    return this.processQueue();
                }
            }

            const {userId, userApiKeyId} = waitingQueue;
            const {entityType, entityId, entityIds, options} = JSON.parse(waitingQueue.inputJson);
            let operationPrefix;
            if (entityType === 'content-list') {
                operationPrefix = 'type:' + entityType + ';id:' + helpers.keccak(JSON.stringify(entityIds));
            } else {
                operationPrefix = 'type:' + entityType + ';id:' + entityId;
            }
            const asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
                userApiKeyId,
                name: 'run-' + this.moduleName,
                channel: operationPrefix + ';op:' + await commonHelper.random()
            });
            // console.log('asyncOperation', asyncOperation);

            await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

            // run in background
            let operationPromise;
            if (entityType === 'content-list') {
                operationPromise = this.generateContentListSite(userId, entityType, entityIds, {
                    ...options,
                    asyncOperationId: asyncOperation.id
                });
            } else {
                operationPromise = this.generateGroupSite(userId, entityType, entityId, {
                    ...options,
                    asyncOperationId: asyncOperation.id
                });
            }
            operationPromise.then(async (storageId) => {
                await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
                await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id);
                if (finishCallbacks[waitingQueue.id]) {
                    finishCallbacks[waitingQueue.id](await app.ms.asyncOperation.getAsyncOperation(asyncOperation.userId, asyncOperation.id));
                }
                this.processQueue();
            }).catch(async e => {
                await app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, e.message);
                if (finishCallbacks[waitingQueue.id]) {
                    finishCallbacks[waitingQueue.id](await app.ms.asyncOperation.getAsyncOperation(asyncOperation.userId, asyncOperation.id));
                }
            });

            return waitingQueue;
        }

        async getDefaultOptionsByGroupId(userId, groupId) {
            return this.getEntityDefaultOptions('group', await app.ms.group.getLocalGroup(userId, groupId));
        }

        async getEntityDefaultOptions(entityType, group) {
            const staticSite = await models.StaticSite.findOne({where: {entityType, entityId: group.id.toString()}});
            let staticSiteOptions = {};
            try {
                staticSiteOptions = JSON.parse(staticSite.options)
            } catch (e) {}
            return {
                lang: 'en',
                dateFormat: 'DD.MM.YYYY hh:mm:ss',
                post: {
                    titleLength: 0,
                    descriptionLength: 400,
                },
                postList: {
                    postsPerPage: 10,
                },
                site: {
                    title: staticSite ? staticSite.title : group.title,
                    name: staticSite ? staticSite.name : group.name + '_site',
                    description: staticSite ? staticSite.description : group.description,
                    username: group.name,
                    base
                },
                ...staticSiteOptions
            }
        }

        async getGroupResultOptions(group, options) {
            options = _.clone(options) || {};
            options.view = options.view || group.view;
            const defaultOptions = await this.getEntityDefaultOptions('group', group);
            const merged = _.merge(defaultOptions, options, {
                site: {
                    avatarStorageId: group.avatarImage ? group.avatarImage.storageId : null,
                    postsCount: group.publishedPostsCount,
                }
            });
            ['post.titleLength', 'post.descriptionLength', 'postList.postsPerPage'].forEach(name => {
                _.set(merged, name, parseInt(_.get(merged, name)))
            });
            if (!merged.site.avatarUrl && merged.site.avatarStorageId) {
                merged.site.avatarUrl = options.baseStorageUri + merged.site.avatarStorageId;
            }
            return merged;
        }

        async prepareContentListForRender(userId, entityType, entityIds, options: any = {}) {
            const entityId = helpers.keccak(JSON.stringify(entityIds));

            let staticSite = await this.getOrCreateStaticSite(userId, entityType, entityId, options.title, options.site.name, options);
            const contents = await app.ms.database
                .getUserContentListByIds(userId, entityIds)
                .then(list => list.map(c => c.toJSON()));
            const siteStorageDir = `/${staticSite.staticId}-site`;

            await app.ms.storage.makeDir(siteStorageDir).catch(() => {/*already made*/});

            return {
                staticSite,
                siteStorageDir,
                renderData: { contents, options: {lang: 'en'} }
            }
        }

        async prepareGroupPostsForRender(userId, entityType, entityId, options: any = {}) {
            const group = await app.ms.group.getLocalGroup(userId, entityId);
            let staticSite = await this.getOrCreateStaticSite(userId, entityType, entityId, options.title, options.site.name, options);
            options = await this.getGroupResultOptions(group, options);

            const {list: groupPosts} = await app.ms.group.getGroupPosts(entityId, {}, {
                sortBy: 'publishedAt',
                sortDir: 'desc',
                limit: 9999,
                offset: 0
            });
            console.log('groupPosts.length', groupPosts.length);

            const siteStorageDir = `/${staticSite.staticId}-site`;

            const posts = await pIteration.mapSeries(groupPosts, async (gp, i) => {
                if (options.asyncOperationId && i % 10 === 0) {
                    await app.ms.asyncOperation.updateAsyncOperation(userId, options.asyncOperationId, (i + 1) * 50 / groupPosts.length);
                }
                return this.postToObj(options, siteStorageDir, gp);
            });

            await app.ms.storage.makeDir(siteStorageDir).catch(() => {/*already made*/});

            const postsPerPage = options.postList.postsPerPage;
            const pagesCount = Math.ceil(posts.length / postsPerPage);

            const indexById = {};
            posts.forEach((p, i) => {
                indexById[p.id] = i;
            });

            return {
                staticSite,
                siteStorageDir,
                manifestStorageId: group.manifestStorageId,
                renderData: {
                    options,
                    posts,
                    pagesCount,
                    postsPerPage,
                    indexById
                }
            }
        }

        async getOrCreateStaticSite(userId, entityType, entityId, title, name, options) {
            let staticSite = await models.StaticSite.findOne({where: {entityType, entityId: entityId.toString()}});
            if (!staticSite) {
                staticSite = await this.createDbStaticSite({userId, entityType, entityId, title: options.title, name: options.site.name, options: JSON.stringify(options)});
                await this.bindSiteToStaticId(userId, staticSite.id);
                staticSite = await models.StaticSite.findOne({where: {id: staticSite.id}});
            }
            return staticSite;
        }

        async generateGroupSite(userId, entityType, entityId, options: any = {}): Promise<string> {
            const {
                staticSite,
                siteStorageDir,
                renderData,
                manifestStorageId
            } = await this.prepareGroupPostsForRender(userId, entityType, entityId, options);

            // VueSSR: initialize app
            const {renderPage, css} = await prepareRender(renderData);
            const {id: cssStorageId} = await app.ms.storage.saveFileByData(css);
            await app.ms.storage.copyFileFromId(cssStorageId, `${siteStorageDir}/style.css`);

            // VueSSR: render main page
            /*  Example for file write:
                async renderAndWrite(renderPage, routePath) {
                    const htmlContent = await renderPage(routePath);
                    fs.writeFileSync(routePath + '/index.html', htmlContent);
                }
             */
            await this.renderAndSave(renderPage, options, siteStorageDir, ``, 'main');
            for (let i = 1; i <= renderData.pagesCount - 1; i++) {
               // VueSSR: render other pages by url
               await this.renderAndSave(renderPage, options, siteStorageDir, `/page/${i}`, 'page');
            }
            await pIteration.forEachSeries(renderData.posts, (p) => this.renderAndSave(renderPage, options, siteStorageDir, `/post/${p.id}`, 'post', p));

            const storageId = await app.ms.storage.getDirectoryId(siteStorageDir);
            const baseData = {storageId, lastEntityManifestStorageId: manifestStorageId, options: JSON.stringify(options)};
            await this.updateDbStaticSite(staticSite.id, baseData);
            return storageId;
        }

        async generateContentListSite(userId, entityType, entityIds, options: any = {}): Promise<string> {
            const {
                staticSite,
                siteStorageDir,
                renderData,
            } = await this.prepareContentListForRender(userId, entityType, entityIds, options);

            const {renderPage, css} = await prepareRender(renderData);
            const {id: cssStorageId} = await app.ms.storage.saveFileByData(css);
            await app.ms.storage.copyFileFromId(cssStorageId, `${siteStorageDir}/style.css`);

            await this.copyContentsToSite(siteStorageDir, renderData.contents);

            await this.renderAndSave(renderPage, options, siteStorageDir, ``, 'main');
            const storageId = await app.ms.storage.getDirectoryId(siteStorageDir);
            const baseData = {storageId, options: JSON.stringify(options)};
            await this.updateDbStaticSite(staticSite.id, baseData);
            return storageId;
        }

        async postToObj(options, siteStorageDir, gp) {
            if (!gp) {
                return null;
            }
            const contents = await app.ms.group.getPostContentWithUrl('', gp);
            await this.copyContentsToSite(siteStorageDir, contents);
            return {
                id: gp.localId,
                lang: options.lang,
                contents,
                group: gp.group ? _.pick(gp.group, ['name', 'title', 'manifestStorageId', 'manifestStaticStorageId', 'propertiesJson']) : null,
                replyTo: await this.postToObj(options, siteStorageDir, gp.replyTo),
                repostOf: await this.postToObj(options, siteStorageDir, gp.repostOf),
                date: gp.publishedAt.getTime(),
                ...getPostTitleAndDescription(gp, contents, options.post)
            }
        }

        async copyContentsToSite(siteStorageDir, contents) {
            await pIteration.forEach(contents, async c => {
                await app.ms.storage.fileLs('/ipfs/' + c.storageId).then(r => {
                    console.log('res fileLs', c.storageId, r);
                }).catch(e => {
                    console.error('err fileLs', c.storageId, e);
                });
                await app.ms.storage.copyFileFromId(c.storageId, `${siteStorageDir}/content/${c.storageId}${c.type === 'video' ? '.mp4' : ''}`);
                await app.ms.storage.copyFileFromId(c.previewStorageId, `${siteStorageDir}/content/${c.previewStorageId}`);
            });
        }

        async renderAndSave(renderPage, options, storageDir, path, type, p = null) {
            let pageTitle = '';
            if (type === 'main') {
                pageTitle = `${options.site.title} - Main page`;
            } else if (type === 'page') {
                pageTitle = `${options.site.title} - Page #${_.last(path.split('/'))}`;
            } else if (type === 'post') {
                pageTitle = `${options.site.title} - ${p && p.pageTitle ? p.pageTitle : 'Post #' + p.id}`;
            }
            const pageDescription = type === 'post' && p && p.pageDescription ? p.pageDescription : options.site.description;
            const postImages = type === 'post' && p ? p.contents.filter(c => c.type === 'image') : [];
            const imageUrl = postImages.length ? postImages[0].url : options.site.avatarUrl;

            const headers = getOgHeaders(options.site.title, options.lang, pageTitle, pageDescription, imageUrl);
            const htmlContent = await renderPage(path || '/', headers);
            const {id: storageId} = await app.ms.storage.saveFileByData(htmlContent);
            return app.ms.storage.copyFileFromId(storageId, `${storageDir}${path + '/'}index.html`);
        }

        async updateDbStaticSite(id, data) {
            return models.StaticSite.update(data, {where: {id}});
        }

        async createDbStaticSite(data) {
            return models.StaticSite.create(data);
        }

        async bindSiteToStaticId(userId, staticSiteId) {
            const staticSite = await models.StaticSite.findOne({where: {id: staticSiteId}});
            if (!staticSite) {
               throw new Error("static_site_not_found");
            }
            const {entityType, entityId, name} = staticSite;
            console.log('entityType', entityType, 'entityId', entityId, 'name', name);
            let staticId;
            if (entityType === 'group') {
                staticId = await app.ms.staticId.getOrCreateStaticGroupAccountId(userId, entityId, name);
                if (staticSite.storageId) {
                    await app.ms.staticId.bindToStaticIdByGroup(userId, entityId, staticSite.storageId, staticId);
                }
            } else {
                staticId = await app.ms.staticId.getOrCreateStaticAccountId(userId, name);
                if (staticSite.storageId) {
                    await app.ms.staticId.bindToStaticId(userId, staticSite.storageId, staticId);
                }
            }
            return this.updateDbStaticSite(staticSite.id, {staticId, storageId: staticSite.storageId, name});
        }

        async getStaticSiteInfo(userId, entityType, entityId) {
            const where: any = {entityType, entityId: entityId.toString()};
            if (entityType === 'group') {
                if(!(await app.ms.group.canEditGroup(userId, entityId))) {
                    throw new Error("not_permitted");
                }
            } else {
                where.userId = userId;
            }

            return models.StaticSite.findOne({ where }) as IStaticSite;
        }

        isAutoActionAllowed(userId, funcName, funcArgs) {
            return _.includes(['addRenderToQueueAndProcess', 'runRenderAndWaitForFinish', 'bindSiteToStaticId'], funcName);
        }

        async updateStaticSiteInfo(userId, staticSiteId, updateData) {
            const staticSiteInfo = await models.StaticSite.findOne({ where: {id: staticSiteId}}) as IStaticSite;
            const {entityType, entityId, name} = staticSiteInfo;
            if (!staticSiteInfo) {
                throw new Error("static_site_not_found");
            }
            if (updateData['name'] && !helpers.validateUsername(updateData['name'])) {
                throw new Error("incorrect_name");
            }
            if (name && updateData['name'] && updateData['name'] !== name) {
                if (entityType === 'group') {
                    await app.ms.staticId.renameGroupStaticAccountId(userId, entityId, name, updateData['name']);
                } else {
                    await app.ms.staticId.renameStaticAccountId(userId, name, updateData['name']);
                }
            }
            return this.updateDbStaticSite(staticSiteInfo.id, updateData);
        }
    }

    return new StaticSiteGenerator();
}