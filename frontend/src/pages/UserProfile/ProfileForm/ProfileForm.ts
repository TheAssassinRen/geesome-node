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

import ChooseFileContentsIdsModal from "../../../modals/ChooseFileContentsIdsModal/ChooseFileContentsIdsModal";
import ContentManifestItem from "../../../directives/ContentManifestItem/ContentManifestItem";

export default {
  name: 'profile-form',
  template: require('./ProfileForm.html'),
  components: {ContentManifestItem},
  props: ['user', 'invalid'],
  methods: {
    chooseImage(fieldName) {
      this.$root.$asyncModal.open({
        id: 'choose-file-contents-ids-modal',
        component: ChooseFileContentsIdsModal,
        onClose: (selected) => {
          if (!selected || !selected.length) {
            return;
          }
          this.user[fieldName] = selected[0];
        }
      });
    },
    updateInvalid() {
      const invalid = !this.user.name;
      this.$emit('update:invalid', invalid);
    }
  },
  watch: {
    'user.name'() {
      this.updateInvalid();
    },
    // 'user.title'() {
    //   this.updateInvalid();
    // }
  },
  data() {
    return {
      localeKey: 'user_form'
    };
  }
}