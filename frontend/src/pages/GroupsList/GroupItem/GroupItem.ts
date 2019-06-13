/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster), 
 * [Valery Litvin](https://github.com/litvintech) by 
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 * ​
 * Copyright ©️ 2018 Galt•Core Blockchain Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and 
 * Galt•Space Society Construction and Terraforming Company by 
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {EventBus, UPDATE_MEMBER_GROUPS} from "../../../services/events";

const _ = require('lodash');
const moment = require('moment');

export default {
    template: require('./GroupItem.html'),
    props: ['group'],
    async created() {
        try {
            this.isCanEditGroup = await this.$coreApi.getCanEditGroup(this.group.id);
        } catch (e) {
            // do nothing
        }
        if(!this.isCanEditGroup) {
            this.isJoined = await this.$coreApi.isMemberOfGroup(this.group.id);
        }
    },

    async mounted() {

    },

    methods: {
        async updateIsJoined() {
            this.isJoined = await this.$coreApi.isMemberOfGroup(this.group.id);
            this.$emit('change');
            EventBus.$emit(UPDATE_MEMBER_GROUPS);
        },
        joinGroup() {
            this.$coreApi.joinGroup(this.group.id).then(() => this.updateIsJoined())
        },
        leaveGroup() {
            this.$coreApi.leaveGroup(this.group.id).then(() => this.updateIsJoined())
        }
    },

    watch: {
        value() {
            
        }
    },

    computed: {
        
    },
    data() {
        return {
            isCanEditGroup: null,
            isJoined: null
        }
    },
}