import {Util} from "./Util.js";
import {UtilGameSettings} from "./UtilGameSettings.js";
import {SharedConsts} from "../shared/SharedConsts.js";
// N.b. this should not depend on `Config`

class UtilCompat {
	static init () {
		this._init_doShowNotification().then(null);
	}

	static async _init_doShowNotification () {
		if (!game.user.isGM) return;

		const {system, isUnknownVersion, major, minor, patch, version} = Util.Versions.getSystemVersion();

		// Ignore "unknown version" systems, as we assume the user knows what they're doing
		//   (e.g. is running a test version).
		if (isUnknownVersion) return;

		const supportedSystemMeta = this._SYSTEMS_SUPPORTED[system];
		if (!supportedSystemMeta) return; // As above; ignore, and assume user competence :^)

		const isBelowMin = supportedSystemMeta.min
			? major < supportedSystemMeta.min.major
			|| (major === supportedSystemMeta.min.major && minor < supportedSystemMeta.min.minor)
			|| (major === supportedSystemMeta.min.major && minor === supportedSystemMeta.min.minor && patch < supportedSystemMeta.min.patch)
			: false;
		const isAboveMax = supportedSystemMeta.max
			? major > supportedSystemMeta.max.major
			|| (major === supportedSystemMeta.max.major && minor > supportedSystemMeta.max.minor)
			|| (major === supportedSystemMeta.max.major && minor === supportedSystemMeta.max.minor && patch > supportedSystemMeta.max.patch)
			: false;
		if (!isBelowMin && !isAboveMax) return;

		const {Config} = await import("./Config.js");

		ui.notifications.warn(`Game system "${system}" version ${version} is ${[isBelowMin ? `below the minimum required version (${this._getVersionString(supportedSystemMeta.min)})` : null, isAboveMax ? `above the maximum supported version (${this._getVersionString(supportedSystemMeta.max)})` : null].filter(Boolean).join(" and ")} for use with ${Config.get("ui", "isStreamerMode") ? SharedConsts.MODULE_TITLE_FAKE : SharedConsts.MODULE_TITLE}. Please ${isAboveMax ? "downgrade" : "upgrade"} your system version.`);
	}

	static _getVersionString (versionDict) { return `${versionDict.major}.${versionDict.minor}.${versionDict.patch}`; }

	static isModuleActive (moduleId) { return !!game.modules.get(moduleId)?.active; }

	static isLibWrapperActive () { return this.isModuleActive(UtilCompat._MODULE_LIB_WRAPPER); }
	static isDaeActive () { return this.isModuleActive(UtilCompat.MODULE_DAE); }
	static isDragUploadActive () { return this.isModuleActive(UtilCompat._MODULE_DRAG_UPLOAD); }
	static isBetterRollsActive () { return this.isModuleActive(UtilCompat._MODULE_BETTER_ROLLS); }
	static isPermissionViewerActive () { return this.isModuleActive(UtilCompat.MODULE_PERMISSION_VIEWER); }
	static isSmolFoundryActive () { return this.isModuleActive(UtilCompat.MODULE_SMOL_FOUNDRY); }
	static isTwilightUiActive () { return this.isModuleActive(UtilCompat._MODULE_TWILIGHT_UI); }
	static isTidy5eSheetActive () { return this.isModuleActive(UtilCompat._MODULE_TIDY5E_SHEET); }
	static isObsidianActive () { return this.isModuleActive(UtilCompat._MODULE_OBSIDIAN); }
	static isBabeleActive () { return this.isModuleActive(UtilCompat._MODULE_BABELE); }
	static isMonksLittleDetailsActive () { return this.isModuleActive(UtilCompat.MODULE_MONKS_LITTLE_DETAILS); }
	static isBetterRolltablesActive () { return this.isModuleActive(UtilCompat.MODULE_BETTER_ROLLTABLES); }
	static isItemPilesActive () { return this.isModuleActive(UtilCompat._MODULE_BETTER_ROLLTABLES); }
	static isPlutoniumAddonAutomationActive () { return this.isModuleActive(UtilCompat.MODULE_PLUTONIUM_ADDON_AUTOMATION); }
	static isMidiQolActive () { return this.isModuleActive(UtilCompat.MODULE_MIDI_QOL); }
	static isModuleMulticlassSpellbookFilterActive () { return this.isModuleActive(UtilCompat.MODULE_MULTICLASS_SPELLBOOK_FILTER); }

	static getApi (moduleName) {
		if (!this.isModuleActive(moduleName)) return null;
		return game.modules.get(moduleName).api;
	}

	static isDaeGeneratingArmorEffects () {
		if (!this.isDaeActive()) return false;
		return !!UtilGameSettings.getSafe(UtilCompat.MODULE_DAE, "calculateArmor");
	}

	static getFeatureFlags ({isReaction}) {
		const out = {};

		if (isReaction) {
			// Support "Better NPC Sheets 5e", which is apparently incapable of determining a reaction using the standard
			//   "Action type: reaction" data :^)
			out.adnd5e = {itemInfo: {type: "reaction"}};
		}

		return out;
	}

	static MonksLittleDetails = class {
		/**
		 * Based on `MonksLittleDetails.isDefeated`
		 */
		static isDefeated (token) {
			return (
				(token.combatant && token.combatant.data.defeated)
				|| token.actor?.effects.find(e => e.getFlag("core", "statusId") === CONFIG.Combat.defeatedStatusId)
				|| token.data.overlayEffect === CONFIG.controlIcons.defeated
			);
		}
	};
}
UtilCompat._MODULE_LIB_WRAPPER = "lib-wrapper";
UtilCompat.MODULE_DAE = "dae";
UtilCompat._MODULE_DRAG_UPLOAD = "dragupload";
UtilCompat._MODULE_BETTER_ROLLS = "betterrolls5e";
UtilCompat.MODULE_MIDI_QOL = "midi-qol";
UtilCompat.MODULE_KANKA_FOUNDRY = "kanka-foundry";
UtilCompat.MODULE_SMOL_FOUNDRY = "smol-foundry";
UtilCompat.MODULE_PERMISSION_VIEWER = "permission_viewer";
UtilCompat._MODULE_TWILIGHT_UI = "twilight-ui";
UtilCompat._MODULE_TIDY5E_SHEET = "tidy5e-sheet";
UtilCompat._MODULE_OBSIDIAN = "obsidian";
UtilCompat._MODULE_BABELE = "babele";
UtilCompat.MODULE_MONKS_LITTLE_DETAILS = "monks-little-details";
UtilCompat.MODULE_MONKS_ENHANCED_JOURNAL = "monks-enhanced-journal";
UtilCompat.MODULE_BETTER_ROLLTABLES = "better-rolltables";
UtilCompat._MODULE_BETTER_ROLLTABLES = "item-piles";
UtilCompat.MODULE_PLUTONIUM_ADDON_AUTOMATION = "plutonium-addon-automation";
UtilCompat.MODULE_LEVELS = "levels";
UtilCompat.MODULE_MULTICLASS_SPELLBOOK_FILTER = "spell-class-filter-for-5e";
UtilCompat.MODULE_ROLLDATA_AWARE_ACTIVE_EFFECTS = "fvtt-rolldata-aware-active-effects";

UtilCompat._SYSTEMS_SUPPORTED = {
	"dnd5e": {
		min: {
			major: 1,
			minor: 6,
			patch: 0,
		},
		max: {
			major: 1,
			minor: 6,
			patch: 999,
		},
	},
};

export {UtilCompat};
