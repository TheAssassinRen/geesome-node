/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

module.exports = async function (sequelize, models) {
    const Sequelize = require('sequelize');
    
    const Content = sequelize.define('content', {
        // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
        name: {
            type: Sequelize.STRING(200)
        },
        description: {
            type: Sequelize.STRING
        },
        ipfsHash: {
            type: Sequelize.STRING(200)
        },
        isPublic: {
            type: Sequelize.BOOLEAN
        }
    } as any, {
        indexes: [
            // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
            // { fields: ['chainAccountAddress'] },
            // { fields: ['tokensAddress'] },
            // { fields: ['tokensAddress', 'chainAccountAddress'] }
        ]
    } as any);

    Content.belongsTo(models.Group, { as: 'post', foreignKey: 'postId' });
    models.Group.hasMany(Content, { as: 'contents', foreignKey: 'postId' });

    Content.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
    models.User.hasMany(Content, { as: 'contents', foreignKey: 'userId' });

    return Content.sync({});
};