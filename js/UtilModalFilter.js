import {SharedConsts} from "../shared/SharedConsts.js";
import {Util} from "./Util.js";

/**
 * @mixin
 */
function MixinModalFilterFvtt (Cls) {
	class MixedModalFilterFvtt extends Cls {
		constructor (...args) {
			super(...args);

			this._prevApp = null;
		}

		// @Override
		_getNameStyle () { return ""; }

		// @Override
		_getShowModal (resolve) {
			if (this._prevApp) this._prevApp.close();

			const self = this;

			const app = new class TempApplication extends Application {
				constructor () {
					super({
						title: `Filter/Search for ${self._modalTitle}`,
						template: `${SharedConsts.MODULE_LOCATION}/template/_Generic.hbs`,
						width: Util.getMaxWindowWidth(900),
						height: Util.getMaxWindowHeight(),
						resizable: true,
					});

					this._$wrpHtmlInner = $(`<div class="ve-flex-col w-100 h-100"></div>`);
				}

				get $modalInner () { return this._$wrpHtmlInner; }

				async close (...args) {
					self._filterCache.$wrpModalInner.detach();
					await super.close(...args);
					resolve([]);
				}

				activateListeners ($html) {
					this._$wrpHtmlInner.appendTo($html);
				}
			}();

			app.render(true);
			this._prevApp = app;

			return {$modalInner: app.$modalInner, doClose: app.close.bind(app)};
		}

		getDataFromSelected (selected) { return this._allData[selected.ix]; }
	}
	return MixedModalFilterFvtt;
}

/**
 * @mixes MixinModalFilterFvtt
 */
class ModalFilterBackgroundsFvtt extends MixinModalFilterFvtt(ModalFilterBackgrounds) {}

/**
 * @mixes MixinModalFilterFvtt
 */
class ModalFilterClassesFvtt extends MixinModalFilterFvtt(ModalFilterClasses) {}

/**
 * @mixes MixinModalFilterFvtt
 */
class ModalFilterFeatsFvtt extends MixinModalFilterFvtt(ModalFilterFeats) {}

/**
 * @mixes MixinModalFilterFvtt
 */
class ModalFilterRacesFvtt extends MixinModalFilterFvtt(ModalFilterRaces) {}

/**
 * @mixes MixinModalFilterFvtt
 */
class ModalFilterSpellsFvtt extends MixinModalFilterFvtt(ModalFilterSpells) {}

/**
 * @mixes MixinModalFilterFvtt
 */
class ModalFilterItemsFvtt extends MixinModalFilterFvtt(ModalFilterItems) {}

export {
	ModalFilterBackgroundsFvtt,
	ModalFilterClassesFvtt,
	ModalFilterFeatsFvtt,
	ModalFilterRacesFvtt,
	ModalFilterSpellsFvtt,
	ModalFilterItemsFvtt,
};
