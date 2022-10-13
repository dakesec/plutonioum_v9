import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {LGT} from "./Util.js";
import {Patcher_RollData} from "./PatcherRollData.js";
import {Config} from "./Config.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilActors} from "./UtilActors.js";

class Patcher_Item {
	static init () {
		this._init_tryPatchGetRollData();
	}

	static _init_tryPatchGetRollData () {
		try {
			UtilLibWrapper.addPatch(
				"CONFIG.Item.documentClass.prototype.getRollData",
				this._lw_CONFIG_Item_documentClass_prototype_getRollData,
				UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			);
		} catch (e) {
			console.error(...LGT, `Failed to bind getRollData handler!`, e);
		}
	}

	static handleConfigUpdate ({isInit = false} = {}) {
		this._handleConfigUpdate_togglePatches();
		try {
			return this._handleConfigUpdate_();
		} catch (e) {
			if (!isInit) throw e;
			Config.handleFailedInitConfigApplication("importSpell", "spellPointsMode");
			Config.handleFailedInitConfigApplication("importSpell", "spellPointsModeNpc", e);
		}
	}

	static _lw_CONFIG_Item_documentClass_prototype_getRollData (fn, ...args) {
		const out = fn(...args);
		return Patcher_Item._getRollData(this, out);
	}

	static _getRollData (item, rollData) {
		if (!rollData) return rollData;
		Patcher_RollData.addAdditionalRollDataBase(rollData, item);
		return rollData;
	}

	static _handleConfigUpdate_ () {
		this._handleConfigUpdate_togglePatches();
	}

	static _handleConfigUpdate_togglePatches () {
		UtilLibWrapper.togglePatch(
			"CONFIG.Item.documentClass.prototype._getUsageUpdates",
			this._lw_CONFIG_Item_documentClass_prototype_getUsageUpdates,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			Config.get("importSpell", "spellPointsMode") !== ConfigConsts.C_SPELL_POINTS_MODE__DISABLED
			|| Config.get("importSpell", "spellPointsModeNpc") !== ConfigConsts.C_SPELL_POINTS_MODE__DISABLED,
		);
	}

	static _lw_CONFIG_Item_documentClass_prototype_getUsageUpdates (fn, ...args) {
		const out = fn(...args);
		if (!out) return out;

		const {consumeSpellLevel} = args[0];
		if (!consumeSpellLevel) return out;

		if (this?.data?.type !== "spell") return out;

		if (!(this.parent instanceof Actor)) return out;

		const configKeyMode = Config.getSpellPointsKey({actorType: this.parent.type});

		const spellPointsMode = Config.get("importSpell", configKeyMode);
		if (spellPointsMode === ConfigConsts.C_SPELL_POINTS_MODE__DISABLED) return out;

		const mSpellLevel = /^spell(?<castAtLevel>\d+)$/.exec(`${consumeSpellLevel}`);
		if (!mSpellLevel) return;

		const originalItem = this.parent.items.get(this.id);
		if (!originalItem) return out;

		const originalLevel = originalItem.data.data.level;
		if (isNaN(originalLevel)) return out;

		const castAtLevel = Number(mSpellLevel.groups.castAtLevel);
		if (castAtLevel === originalLevel) return out;

		const resource = Config.getSpellPointsResource({isValueKey: true});
		const consumeAmountBase = Parser.spLevelToSpellPoints(originalLevel);
		const consumeAmountCurrent = Parser.spLevelToSpellPoints(castAtLevel);

		const delta = Math.max(0, consumeAmountCurrent - consumeAmountBase);

		if (resource === ConfigConsts.C_SPELL_POINTS_RESOURCE__SHEET_ITEM) {
			const spellPointsItem = UtilActors.getActorSpellPointsItem({actor: this.parent});
			if (!spellPointsItem) return out;

			const toUpdate = out.resourceUpdates.find(it => it._id === spellPointsItem.id);
			if (!toUpdate) return out;

			if (toUpdate["data.uses.value"] == null) return out;

			toUpdate["data.uses.value"] -= delta;

			return out;
		}

		if (out.actorUpdates[`data.${resource}`] == null) return out;

		out.actorUpdates[`data.${resource}`] -= delta;

		return out;
	}
}

export {Patcher_Item};
