import {SharedConsts} from "../shared/SharedConsts.js";
import {ImportListFeat} from "./ImportListFeat.js";
import {ImportListCreature} from "./ImportListCreature.js";
// import {ImportListCreatureFeature} from "./ImportListCreatureFeature.js"; // TODO(v10)
import {ImportListSpell} from "./ImportListSpell.js";
import {ImportListItem} from "./ImportListItem.js";
import {ImportListRace} from "./ImportListRace.js";
import {ImportListRaceFeature} from "./ImportListRaceFeature.js";
import {ImportListClass} from "./ImportListClass.js";
import {ImportListClassFeature} from "./ImportListClassFeature.js";
import {ImportListBackground} from "./ImportListBackground.js";
import {ImportListBackgroundFeature} from "./ImportListBackgroundFeature.js";
import {ImportListVariantRule} from "./ImportListVariantRule.js";
import {ImportListLanguage} from "./ImportListLanguage.js";
import {ImportListRollableTable} from "./ImportListRollableTable.js";
import {ImportListPsionic} from "./ImportListPsionic.js";
import {ImportListOptionalFeature} from "./ImportListOptionalFeature.js";
import {ImportListConditionDisease} from "./ImportListConditionDisease.js";
import {ImportListCultBoon} from "./ImportListCultBoon.js";
import {ImportListAction} from "./ImportListAction.js";
import {ImportListVehicle} from "./ImportListVehicle.js";
import {ImportListVehicleUpgrade} from "./ImportListVehicleUpgrade.js";
import {ImportListObject} from "./ImportListObject.js";
import {ImportListAdventure} from "./ImportListAdventure.js";
import {ImportListBook} from "./ImportListBook.js";
import {ImportListReward} from "./ImportListReward.js";
import {ImportListCharCreationOption} from "./ImportListCharCreationOption.js";
import {ImportListDeity} from "./ImportListDeity.js";
import {ImportListRecipe} from "./ImportListRecipe.js";
import {ImportListMap} from "./ImportListMap.js";
import {UtilApplications} from "./UtilApplications.js";
import {Config} from "./Config.js";
import {LGT, Util} from "./Util.js";
import {FolderPathBuilder} from "./FolderPathBuilder.js";
import {AppSourceSelectorMulti} from "./AppSourceSelectorMulti.js";
import {ImportSpecialPackages} from "./ImportSpecialPackages.js";
import {ImportListHazard} from "./ImportListHazard.js";
import {ImportListTrap} from "./ImportListTrap.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {UtilUi} from "./UtilUi.js";
import {PopoutSheet} from "./PopoutSheet.js";
import {UtilKeybinding} from "./UtilKeybinding.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {UtilHooks} from "./UtilHooks.js";

class ChooseImporter extends Application {
	// region API
	static async api_pOpen ({actor, table} = {}) {
		if (game.user.role < Config.get("import", "minimumRole")) throw new Error(`You do not have sufficient permissions!`);

		if (actor && table) throw new Error(`Options "actor" and "table" are mutually exclusive!`);

		return this._pOpen({actor, table});
	}

	/**
	 * You really shouldn't be using this.
	 * @deprecated
	 */
	static async api_pImportAll () {
		for (const mode of ChooseImporter._MODES) {
			if (mode.isNotAllable || mode.Importer.FOLDER_TYPE === "JournalEntry") continue;

			// region Sanity checks
			if (!mode.Importer.ID) throw new Error(`Importer has no ID!`);
			if (!mode.Importer.DISPLAY_NAME_TYPE_PLURAL) throw new Error(`Importer has no display name!`);
			// endregion

			const importer = new mode.Importer();
			await importer.pInit();

			const packLabel = `${SharedConsts.MODULE_TITLE_FAKE} ${mode.Importer.DISPLAY_NAME_TYPE_PLURAL}`;
			const packName = `${SharedConsts.MODULE_NAME_FAKE}-${mode.Importer.ID}`;

			const existingPack = game.packs.get(`world.${packName}`);
			if (existingPack) await existingPack.deleteCompendium();

			importer.pack = await CompendiumCollection.createCompendium({
				type: mode.Importer.FOLDER_TYPE,
				label: packLabel,
				name: packName,
				package: "world",
			});

			const sources = await importer.pGetSources();
			const source = sources.find(it => it.isDefault);
			if (!source) throw new Error(`No default source found for ${mode.Importer.DISPLAY_NAME_TYPE_PLURAL}`);

			const allContentMeta = await UtilDataSource.pGetAllContent({
				sources: [source],
				page: importer.page,
			});

			if (!allContentMeta) return;

			let allContent = allContentMeta.dedupedAllContentMerged;
			Object.entries(allContent)
				.forEach(([k, arr]) => {
					allContent[k] = arr.filter(it => {
						// Skip UA/AL
						if (it.source.startsWith(SRC_UA_PREFIX) || it.source.startsWith(SRC_AL_PREFIX)) return false;

						// Skip specific variants; we let the generic variant/base item take precedence
						if (it.__prop === "item" && it._category === "Specific Variant") return false;

						return true;
					});
				});

			let allContentFlat = [];
			Object.values(allContent)
				.forEach(arr => {
					allContentFlat = [...allContentFlat, ...arr];
				});

			const tStart = Date.now();
			const msgStart = `Importing ${allContentFlat.length} ${mode.Importer.DISPLAY_NAME_TYPE_PLURAL} to compendium ${packLabel}...`;
			ui.notifications.info(msgStart);
			console.warn(...LGT, msgStart);

			for (const ent of allContentFlat) {
				await importer.pImportEntry(ent);
			}

			const tDelta = Math.round((Date.now() - tStart) / 1000);
			const msgEnd = `Imported ${allContentFlat.length} ${mode.Importer.DISPLAY_NAME_TYPE_PLURAL} to compendium ${packLabel} in ${tDelta}s.`;
			ui.notifications.info(msgEnd);
			console.warn(...LGT, msgEnd);
		}
	}
	// endregion

	// region External
	static prePreInit () {
		this._preInit_registerKeybinds();
		this._preInit_initCacheFlushHooks();
	}

	static _preInit_registerKeybinds () {
		const doKeybindingOpen = ({modeId = null} = {}) => {
			this._pOpen({modeId});
			return true;
		};

		const doKeybindingOpenForCharacter = ({modeId = null} = {}) => {
			const actor = UtilKeybinding.getPlayerActor({minRole: Config.get("import", "minimumRole")});
			if (!actor) return true;
			this._pOpen({modeId, actor});
			return true;
		};

		const doKeybindingOpenForCurrentSheet = ({modeId = null} = {}) => {
			const meta = UtilKeybinding.getCurrentImportableSheetDocumentMeta({isRequireOwnership: true, minRole: Config.get("import", "minimumRole")});
			if (!meta) return true;
			this._pOpen({modeId, ...meta});
			return true;
		};

		game.keybindings.register(
			SharedConsts.MODULE_NAME,
			"ChooseImporter__open",
			{
				name: "Open Import Wizard",
				editable: [],
				onDown: () => doKeybindingOpen(),
				restricted: true,
			},
		);

		game.keybindings.register(
			SharedConsts.MODULE_NAME,
			"ChooseImporter__openForCharacter",
			{
				name: "Open Import Wizard Targeting Player Character",
				editable: [],
				onDown: () => doKeybindingOpenForCharacter(),
			},
		);

		game.keybindings.register(
			SharedConsts.MODULE_NAME,
			"ChooseImporter__openForCurrentSheet",
			{
				name: "Open Import Wizard Targeting Current Sheet",
				editable: [],
				onDown: () => doKeybindingOpenForCurrentSheet(),
			},
		);

		ChooseImporter._MODES.forEach(mode => {
			game.keybindings.register(
				SharedConsts.MODULE_NAME,
				`ChooseImporter__open__${mode.id}`,
				{
					name: `Open Import Wizard (${mode.name})`,
					editable: [],
					onDown: () => doKeybindingOpen({modeId: mode.id}),
					restricted: true,
				},
			);

			if (!mode.requires || mode.requires.actor !== false) {
				game.keybindings.register(
					SharedConsts.MODULE_NAME,
					`ChooseImporter__openForCharacter__${mode.id}`,
					{
						name: `Open Import Wizard (${mode.name}) Targeting Player Character`,
						editable: [],
						onDown: () => doKeybindingOpenForCharacter({modeId: mode.id}),
					},
				);
			}

			if (!mode.requires || mode.requires.actor !== false || mode.requires.table !== false) {
				game.keybindings.register(
					SharedConsts.MODULE_NAME,
					`ChooseImporter__openForCurrentSheet__${mode.id}`,
					{
						name: `Open Import Wizard (${mode.name}) Targeting Current Sheet`,
						editable: [],
						onDown: () => doKeybindingOpenForCurrentSheet({modeId: mode.id}),
					},
				);
			}
		});

		this._IMPORTABLE_HOOK_METAS.forEach(meta => {
			game.keybindings.register(
				SharedConsts.MODULE_NAME,
				`ChooseImporter__openLastUsed__${meta.propGame}`,
				{
					name: `Open Last Used Importer (${meta.propGame.toTitleCase()})`,
					editable: [],
					onDown: () => this._pDoReopenLastUsedImporter({hookName: meta.hookName}),
					restricted: true,
				},
			);
		});
	}

	static _preInit_initCacheFlushHooks () {
		UtilHooks.on(UtilHooks.HK_CONFIG_UPDATE, diff => {
			Object.entries(ChooseImporter._INSTANCE_CACHE)
				.forEach(([key, cachedInstanceMeta]) => {
					if (!cachedInstanceMeta.instance.isInvalidatedByConfigChange(diff)) return;

					this._uncacheInstance(key);
				});
		});
	}

	static _IMPORTABLE_HOOK_METAS = [
		{hookName: "renderSceneDirectory", propGame: "scenes", importerIdDefault: ImportListAdventure.ID},
		{hookName: "renderActorDirectory", propGame: "actors", importerIdDefault: ImportListCreature.ID},
		{hookName: "renderItemDirectory", propGame: "items", importerIdDefault: ImportListItem.ID},
		{hookName: "renderJournalDirectory", propGame: "journal", importerIdDefault: ImportListAdventure.ID},
		{hookName: "renderRollTableDirectory", propGame: "tables", importerIdDefault: ImportListRollableTable.ID},
	];

	static isImportableFvttEntityHook (hookName) {
		return this._IMPORTABLE_HOOK_METAS.some(it => it.hookName === hookName);
	}

	static async pHandleButtonClick (evt, app, $html, data) {
		evt.preventDefault();
		await this._pOpen({actor: app.actor, table: app instanceof RollTableConfig ? app.document : null});
	}

	static async _pOpen ({actor, table, modeId = null} = {}) {
		const chooseImporter = new ChooseImporter({actor, table, modeId});
		await chooseImporter.render(true);
		return chooseImporter;
	}

	static $getDirButton (hookName) {
		return $(`<button class="imp__btn-open w-100 mx-0">${this._getButtonImportHtml()}</button>`)
			.click((evt) => {
				evt.preventDefault();
				const chooseImporter = new ChooseImporter();
				chooseImporter.render(true);
			});
	}

	static _getButtonImportHtml () { return `${UtilUi.getModuleFaIcon()} ${Config.get("ui", "isStreamerMode") ? "" : "Plutonium "}Import`; }
	static _getButtonImportQuickHtml () { return `<span class="fas fa-fw fa-heart"></span>`; }
	static _getButtonImportQuickTitle () { return `Re-open your last-used importer for this directory.`; }

	static $getDirButtonQuick (hookName) {
		return $(`<button class="imp__btn-open mx-0 w-initial ve-flex-vh-center"></button>`)
			.html(this._getButtonImportQuickHtml())
			.title(this._getButtonImportQuickTitle())
			.click(async evt => {
				evt.preventDefault();
				await this._pDoReopenLastUsedImporter({hookName});
			});
	}

	static async _pDoReopenLastUsedImporter ({hookName}) {
		const lastUsedModes = await StorageUtil.pGet(ChooseImporter._STORAGE_KEY_LAST_USED_MODE) || {};

		const chooseImporter = new ChooseImporter({modeId: this._pDoReopenLastUsedImporter_getModeId(hookName, lastUsedModes)});
		await chooseImporter.pDoQuickOpenUsingExistingSourceSelection();
	}

	static _pDoReopenLastUsedImporter_getModeId (hookName, lastUsedModes) {
		const meta = this._IMPORTABLE_HOOK_METAS.find(it => it.hookName === hookName);
		if (!meta) throw new Error(`Unhandled hook "${hookName}"!`);
		return lastUsedModes?.[meta.propGame] || meta.importerIdDefault;
	}

	static getImporterClassMeta (dataPropOrTagOrPage) {
		switch (dataPropOrTagOrPage) {
			case "feat":
			case UrlUtil.PG_FEATS: return {Class: ImportListFeat, isAcceptActor: true};
			case "creature":
			case "monster":
			case UrlUtil.PG_BESTIARY: return {Class: ImportListCreature};

				// region TODO(v10)
				// TODO other props
				// TODO better system
				// case "monsterAction":
				// 	return {Class: ImportListCreatureFeature};
				// endregion

			case "spell":
			case UrlUtil.PG_SPELLS: return {Class: ImportListSpell, isAcceptActor: true};
			case "item":
			case "baseitem":
			case "magicvariant":
			case UrlUtil.PG_ITEMS: return {Class: ImportListItem, isAcceptActor: true};
			case "race":
			case UrlUtil.PG_RACES: return {Class: ImportListRace, isAcceptActor: true};
			case "raceFeature": return {Class: ImportListRaceFeature, isAcceptActor: true};
			case "class":
			case UrlUtil.PG_CLASSES: return {Class: ImportListClass, isAcceptActor: true}; // TODO need to specify the method used
			case "background":
			case UrlUtil.PG_BACKGROUNDS: return {Class: ImportListBackground, isAcceptActor: true};
			case "backgroundFeature": return {Class: ImportListBackgroundFeature, isAcceptActor: true};
			case "variantrule":
			case UrlUtil.PG_VARIANTRULES: return {Class: ImportListVariantRule};
			case "language":
			case UrlUtil.PG_LANGUAGES: return {Class: ImportListLanguage};
			case "table":
			case "tableGroup":
			case UrlUtil.PG_TABLES: return {Class: ImportListRollableTable};
			case "psionic":
			case UrlUtil.PG_PSIONICS: return {Class: ImportListPsionic, isAcceptActor: true};
			case "optfeature":
			case "optionalfeature":
			case UrlUtil.PG_OPT_FEATURES: return {Class: ImportListOptionalFeature, isAcceptActor: true};
			case "condition":
			case "disease":
			case UrlUtil.PG_CONDITIONS_DISEASES: return {Class: ImportListConditionDisease, isAcceptActor: true};
			case "action":
			case UrlUtil.PG_ACTIONS: return {Class: ImportListAction, isAcceptActor: true};
			case "cult":
			case "boon":
			case UrlUtil.PG_CULTS_BOONS: return {Class: ImportListCultBoon, isAcceptActor: true};
			case "reward":
			case UrlUtil.PG_REWARDS: return {Class: ImportListReward, isAcceptActor: true};
			case "classFeature":
			case "subclassFeature": return {Class: ImportListClassFeature, isAcceptActor: true};
			case "charoption":
			case UrlUtil.PG_CHAR_CREATION_OPTIONS: return {Class: ImportListCharCreationOption, isAcceptActor: true};
			case "vehicle":
			case UrlUtil.PG_VEHICLES: return {Class: ImportListVehicle};
			case "vehupgrade":
			case "vehicleUpgrade":
			case "vehicleupgrade": return {Class: ImportListVehicleUpgrade};
			case "object":
			case UrlUtil.PG_OBJECTS: return {Class: ImportListObject};
			case "deity":
			case UrlUtil.PG_DEITIES: return {Class: ImportListDeity};
			case "recipe":
			case UrlUtil.PG_RECIPES: return {Class: ImportListRecipe};
			case "trap":
			case UrlUtil.PG_TRAPS_HAZARDS: return {Class: ImportListTrap};
			case "hazard": return {Class: ImportListHazard};

			case "skill":
			case "sense": return {isViewOnly: true};

			default: return null;
		}
	}

	static getImporter (dataPropOrTagOrPage, actor) {
		const meta = this.getImporterClassMeta(dataPropOrTagOrPage);
		if (!meta) return null;

		const {Class, isAcceptActor} = meta;
		if (isAcceptActor) return new Class({actor});
		return new Class();
	}
	// endregion

	/**
	 * @param [opts]
	 * @param [opts.actor]
	 * @param [opts.mode] A predefined mode that the wizard should use, rather than allowing the user to pick one.
	 * @param [opts.mode.id]
	 * @param [opts.mode.name]
	 * @param [opts.mode.singleName]
	 * @param [opts.mode.wizardTitleWindow]
	 * @param [opts.mode.wizardTitlePanel3]
	 * @param [opts.mode.wizardTitleButtonOpenImporter]
	 * @param [opts.mode.importerTitleWindow]
	 * @param [opts.mode.importerTitleButtonRun]
	 * @param [opts.modeId] An alternative to `opts.mode`, which has the instance lookup its own copy of the mode.
	 * @param [opts.namespace] A namespace for this wizard. Useful for non-standard flows.
	 * @param [opts.isAlwaysCloseWindow] If the window should always be closed on clicking "Import"
	 * @param [opts.isTemp] If any imported items are temporary, i.e. the folder/compendium controls should be hidden.
	 * @param [opts.importerPreRenderArgs] Arguments to be passed to an importer's pre-render method.
	 */
	constructor (opts) {
		opts = opts || {};

		// region Validation
		if (opts.actor && opts.table) throw new Error(`Both "actor" and "table" options were specified!`);

		if (!opts.mode && opts.modeId && !ChooseImporter._MODES.some(it => it.id === opts.modeId)) {
			const msg = `Could not find importer mode "${opts.modeId}"! The default importer will be shown instead.`;
			ui.notifications.warn(msg);
			console.warn(...LGT, msg);
			opts = {...opts};
			delete opts.modeId;
		}
		// endregion

		const width = (opts.mode || opts.modeId) ? Util.getMaxWindowWidth(1000) : Util.getMaxWindowWidth(1200);
		const template = (opts.mode || opts.modeId)
			? `${SharedConsts.MODULE_LOCATION}/template/ChooseImporterForMode.hbs`
			: `${SharedConsts.MODULE_LOCATION}/template/ChooseImporter.hbs`;

		super({
			width,
			height: Util.getMaxWindowHeight(970),
			title: MiscUtil.get(opts.mode, "wizardTitleWindow") || `Import Wizard${opts.actor || opts.table ? ": Importing to " : ""}${opts.actor ? `Actor "` : opts.table ? `Table "` : ""}${opts.actor?.name || opts.table?.name || ""}${opts.actor || opts.table ? `"` : ""}`,
			template,
			resizable: true,
		});

		this._actor = opts.actor;
		this._table = opts.table;
		this._predefinedMode = opts.mode;
		if (!this._predefinedMode && opts.modeId) this._predefinedMode = ChooseImporter._MODES.find(it => it.id === opts.modeId);
		this._namespace = opts.namespace || "default";
		this._isAlwaysCloseWindow = !!opts.isAlwaysCloseWindow;
		this._isTemp = !!opts.isTemp;
		this._importerPreRenderArgs = opts.importerPreRenderArgs;

		// Local fields
		this.__comp = BaseComponent.fromObject(ChooseImporter._getDefaultState());
		this._comp = this.__comp.getPod();

		this._modes = [];
		if (this._predefinedMode) this._modes = [this._predefinedMode];

		this._deferredHooks = [];

		this._doSaveStateDebounced = null;

		this._$window = null;
		this._$panel1 = null;
		this._$panel2 = null;
		this._$panel2Head = null;
		this._$panel2WrpLoader = null;
		this._$panel2WrpList = null;
		this._$panel3 = null;
		this._$panel3Head = null;
		this._$panel3WrpLoader = null;
		this._$panel3WrpTabs = null;
		this._$panel3WrpConfig = null;
		this._$panel3_tab1 = null;
		this._$panel3_tab2 = null;
		this._$panel3_btnImportPackage = null;

		this._$btnOpenImporter = null;

		this._rowMetasMode = [];
		this._importer = null;

		// region Source selector
		this._appSourceSelector = null;

		this._$stgNone = null;
		this._$stgUpload = null;
		this._$stgUrl = null;
		this._$stgSpecial = null;
		// endregion

		this._packageIndex = null;
		this._pPackageIndex = null;
		this._uiHooks = {};
	}

	_trackUiHook (prop, hook) { (this._uiHooks[prop] = this._uiHooks[prop] || []).push(hook); }
	_resetUiHooks () {
		Object.entries(this._uiHooks)
			.forEach(([prop, hook]) => {
				this._comp.removeHook(prop, hook);
			});
		this._uiHooks = {};
	}

	_pDoSaveState () {
		return StorageUtil.pSet(this._getSelectedImporterStorageKey(), this.__comp.getSaveableState());
	}

	/** Check if this application is skippable, but not if the embedded source selector is skippable. */
	isMaybeSkippable () {
		// If the user can select a mode, this window cannot be skipped
		if (!this._predefinedMode) return false;

		// If we don't have an actor/table (or if this is not a temporary import), the user can choose e.g. folder
		//   options, so this window cannot be skipped.
		if (!this._actor && !this._table && !this._isTemp) return false;

		return true;
	}

	/** Init the embedded source selector, and check if it is skippable. */
	async pInitIsSubSkippable () {
		await this._pInitImporter(this._getMode());
		await this._pInitSourceSelector();

		// Allow skips if the source selection is predefined
		return this._appSourceSelector.isForceSelectAllSources();
	}

	activateListeners ($html) {
		super.activateListeners($html);

		this._bindTargetEntityDeletedHooks();

		this._$window = $html;

		if (!this._predefinedMode) this._$panel1 = $html.find(`[data-panel="1"]`);
		else this._activateListeners_initPredefinedMode();
		this._$panel2 = $html.find(`[data-panel="2"]`);
		this._$panel3 = $html.find(`[data-panel="3"]`);

		if (!this._predefinedMode) {
			const status = this._activateListeners_fillPanel1(this._$panel1);

			if (status === VeCt.SYM_UI_SKIP) {
				ui.notifications.warn(`No available importers! You may need to un-hide some.`);

				// Hack to cancel and close the render during rendering process
				if (this.element) this.element.hideVe();
				Hooks.once("renderChooseImporter", (app) => {
					if (app.appId !== this.appId) return;
					// Defer to allow the state to switch to `RENDERED`
					MiscUtil.pDelay(1).then(() => this._pForceClose());
					this._pForceClose();
				});
				return;
			}
		}

		this._activateListeners_fillPanel2(this._$panel2);
		this._activateListeners_fillPanel3(this._$panel3);

		this._doSaveStateDebounced = MiscUtil.debounce(() => this._pDoSaveState(), 50);

		StorageUtil.pGet(this._getSelectedImporterStorageKey())
			.then(save => {
				if (save) {
					if (save.state) save.state.modeId = save.state.modeId || this._modes[0].id;
					else save.state = {modeId: this._modes[0].id};
					this.__comp.setStateFrom(save);
				}

				this._deferredHooks.forEach(hk => hk());
				this._deferredHooks = [];

				this._comp.addHookAll(this._doSaveStateDebounced);
			});
	}

	_bindTargetEntityDeletedHooks () {
		if (this._actor) {
			Hooks.once("deleteActor", actor => {
				if (actor.id !== this._actor.id) return;
				this.close();
				if (this._importer) this._importer.close();
			});
		}

		if (this._table) {
			Hooks.once("deleteTable", table => {
				if (table.id !== this._table.id) return;
				this.close();
				if (this._importer) this._importer.close();
			});
		}
	}

	_activateListeners_initPredefinedMode () {
		this._comp.addHook("modeId", this._activateListeners_pHkMode.bind(this));
		this._deferredHooks.push(this._activateListeners_pHkMode.bind(this));
	}

	_activateListeners_fillPanel1 ($panel) {
		const hiddenIds = Config.get("import", "hiddenImporterIds");

		this._modes = ChooseImporter._MODES
			.filter(({id}) => !hiddenIds[id])
			.filter(mode => !mode.requires || ((mode.requires.actor === false ? !this._actor : true) && (mode.requires.table === false ? !this._table : true)));

		if (!this._modes.length) return VeCt.SYM_UI_SKIP;

		this._rowMetasMode = this._modes.map(mode => {
			const $btn = $(`<button class="btn btn-sm btn-5et w-100">${mode.name}</button>`)
				.click(() => this._comp.set("modeId", mode.id));

			const $btnExternalArchive = mode.metaExternalArchive
				? $(`<a class="btn btn-sm btn-5et imp-wiz__btn-package-archive no-underline" rel="noreferrer noopener" href="${mode.metaExternalArchive.url}">${mode.metaExternalArchive.text} <i class="fas fa-fw fa-external-link-alt"></i></a>`)
				: null;

			const $btnOther = mode.metaOther
				? $(`<button class="btn btn-sm btn-5et px-1 imp-wiz__btn-package-archive h-100">${mode.metaOther.text}</button>`)
					.click(() => mode.metaOther.pFn())
				: null;

			const $btnQuick = $(`<button class="btn btn-sm btn-5et px-1 imp-wiz__btn-quick h-100" title="Open Last-Used Importer"><i class="fas fa-fw fa-forward mr-0"></i></button>`)
				.click(() => this._pDoQuickOpen(mode));

			const $row = $$`<div class="w-100 ve-flex-v-center input-group imp-wiz__row-mode">
				${$btn}
				${$btnExternalArchive}
				${$btnOther}
				${$btnQuick}
			</div>`;

			return {
				$btn,
				$row,
				modeId: mode.id,
			};
		});

		this._comp.addHook("modeId", this._activateListeners_pHkMode.bind(this));
		this._deferredHooks.push(this._activateListeners_pHkMode.bind(this));

		$$($panel)`
			<h4 class="imp-wiz__head-panel">1: Choose Importer</h4>

			<div class="ve-flex-col w-100 h-100 overflow-y-auto overflow-x-hidden">
				${this._rowMetasMode.map(it => it.$row)}
			</div>
		`;
	}

	_getMode () {
		if (this._predefinedMode) return this._predefinedMode;

		const modeId = this._comp.get("modeId");
		return this._modes.find(it => it.id === modeId) || this._modes[0];
	}

	async _activateListeners_pHkMode () {
		if (!this._$panel2Head || !this._$panel3Head) return;

		await this._comp.pLock("modeId");

		try {
			if (UtilApplications.isClosed(this)) return;

			const mode = this._getMode();

			this._rowMetasMode.forEach(meta => meta.$btn.toggleClass("btn--active", meta.modeId === mode.id));

			this._$panel2Head.text(`${this._predefinedMode ? 1 : 2}: Choose Data Source`);
			this._$panel3Head.text(`${this._predefinedMode ? 2 : 3}: ${MiscUtil.get(this._predefinedMode, "wizardTitlePanel3") || "Configure and Import"}`);
			const $ovrLoading2 = await UtilApplications.$pGetAddAppLoadingOverlay(this._$panel2WrpLoader);
			const $ovrLoading3 = await UtilApplications.$pGetAddAppLoadingOverlay(this._$panel3WrpLoader);
			try {
				if (UtilApplications.isClosed(this)) return;

				await this._pInitImporter(mode);
				if (UtilApplications.isClosed(this)) return;

				if (!await this._pIsTableImportAvailable()) { await this._pForceClose(); return; }
				if (UtilApplications.isClosed(this)) return;

				await this._pFillUi();
				if (UtilApplications.isClosed(this)) return;

				this._$panel2Head.text(`${this._predefinedMode ? 1 : 2}: ${mode.singleName ? `Choose ${mode.singleName} Data Source` : `Choose Data Source for ${mode.name}`}`);
				this._$panel3Head.text(`${this._predefinedMode ? 2 : 3}: ${mode.singleName ? `Configure and Import ${mode.singleName}` : `Configure and Import ${mode.name}`}`);

				this._$panel3WrpTabs.toggleVe(mode.hasPackages);
				if (!mode.hasPackages) this._comp.set("ixTabPanel3", 0);
			} catch (e) {
				ui.notifications.error(`Failed to load importer! ${VeCt.STR_SEE_CONSOLE}`);
				throw e;
			} finally {
				if ($ovrLoading2) $ovrLoading2.remove();
				if ($ovrLoading3) $ovrLoading3.remove();

				if (this._$btnOpenImporter) this._$btnOpenImporter.focus();
			}
		} finally {
			this._comp.unlock("modeId");
		}
	}

	async _pIsTableImportAvailable () {
		if (!this._table) return true; // Ignore these checks if we're not in "table" mode
		if (this._importer.isFolderOnly) throw new Error(`Attempting to import non-compendium-friendly mode to table! This is a bug!`);

		const packName = `${SharedConsts.MODULE_NAME_FAKE}-table-backing-${this._importer.constructor.FOLDER_TYPE.toLowerCase()}`;
		const packKey = `world.${packName}`;

		const existingCompendium = game.packs.get(packKey);
		if (existingCompendium) {
			this._importer.pack = existingCompendium;
			return true;
		}

		if (!await InputUiUtil.pGetUserBoolean({title: "Create Backing Compendium?", htmlDescription: `In order to import ${this._importer.constructor.FOLDER_TYPE}s to a rollable table, a backing compendium must be created for ${this._importer.constructor.FOLDER_TYPE}s. Would you like to proceed?`})) {
			return false;
		}

		try {
			this._importer.pack = await CompendiumCollection.createCompendium({
				type: this._importer.constructor.FOLDER_TYPE,
				label: `Table-Backing ${this._importer.constructor.FOLDER_TYPE}s`,
				name: packName,
				package: "world",
			});
		} catch (e) {
			console.error(...LGT, e);
			return false;
		}

		return true;
	}

	async _pInitImporter (mode) {
		mode = mode || this._getMode();
		this._importer = mode.Importer ? new mode.Importer({actor: this._actor, table: this._table}) : mode.importerInstance;
		await this._importer.pInit();
	}

	_activateListeners_fillPanel2 ($panel) {
		this._$panel2Head = $(`<h4 class="imp-wiz__head-panel">${this._predefinedMode ? 1 : 2}: Choose Data Source</h4>`);

		this._$panel2WrpList = $(`<div class="ve-flex-col w-100 h-100"></div>`);

		this._$panel2WrpLoader = $$`<div class="ve-flex-col w-100 h-100 overflow-y-auto">
			${this._$panel2WrpList}
		</div>`;

		$$($panel)`
			${this._$panel2Head}
			${this._$panel2WrpLoader}
		`;
	}

	_activateListeners_fillPanel3 ($panel) {
		this._$panel3Head = $(`<h4 class="imp-wiz__head-panel">${this._predefinedMode ? 2 : 3}: Configure and Import</h4>`);

		this._$panel3WrpConfig = $(`<div class="ve-flex-col w-100 h-100 pb-3"></div>`); // Add padding to dodge the resize handle

		this._$panel3WrpLoader = $$`<div class="ve-flex-col w-100 h-100 overflow-y-auto">
			${this._$panel3WrpConfig}
		</div>`;

		$$($panel)`
			${this._$panel3Head}
			${this._$panel3WrpLoader}
		`;
	}

	_getSelectedImporterStorageKey () {
		const ptMode = this._predefinedMode ? "predefinedMode" : "chooseMode";
		const ptType = this._actor ? "actor" : this._table ? "table" : "directory";
		return `chooseImporter_state_${[ptMode, ptType].join("_")}`;
	}

	static _getDefaultState () {
		return MiscUtil.copy(ChooseImporter._DEFAULT_STATE);
	}

	async _pFillUi () {
		this._resetUiHooks();
		this._$panel2WrpList.empty();
		this._$panel3WrpConfig.empty();

		await this._pFillUi_pFillSourceUi();
		await this._pFillUi_pFillConfigUi();
	}

	async _pInitSourceSelector () {
		const sourcesToDisplay = await this._importer.pGetSources();

		this._appSourceSelector = new AppSourceSelectorMulti({
			sourcesToDisplay,
			savedSelectionKey: this.constructor._getSourceSelectionKey(this._importer),
			filterNamespace: this._getFilterNamespace(),
			isRadio: this._importer.isRadio,
		});
	}

	async _pFillUi_pFillSourceUi () {
		await this._pInitSourceSelector();

		// Generate UI elements for use in our own UI
		const {$stgNone, $stgUpload, $stgUrl, $stgSpecial} = await this._appSourceSelector.pGetElements(
			this._$panel2WrpList,

			/** Callback run each time the importer's source selection changes. */
			(selSources) => {
				const mode = this._getMode();
				if (!mode.hasPackages || !selSources.length) return this._comp.set("packageSource", null);

				// This assumes that any importer mode that has packages can only have a single source active at a time
				//   (i.e. is a "radio button" list).
				const selSource = selSources[0];
				this._comp.set("packageSource", (selSource.userData || {}).source || null);
			},
		);
		this._$stgNone = $stgNone;
		this._$stgUpload = $stgUpload;
		this._$stgUrl = $stgUrl;
		this._$stgSpecial = $stgSpecial;
	}

	async _pFillUi_pFillConfigUi () {
		const $wrpConfigSettings = await this._pFillUi_$pGetWrpConfigSettings();
		if (!$wrpConfigSettings) return;
		this._$btnOpenImporter = this._pFillUi_$getBtnOpenImporter();
		const $btnOpenConfig = this._pFillUi_$getBtnOpenConfig();

		this._$panel3_tab1 = $$`<div class="mb-1">Import From:</div>
			<div class="ve-flex-col w-100 min-h-0 max-h-40 overflow-y-auto mb-1">
				${this._$stgNone}
				${this._$stgUpload}
				${this._$stgUrl}
				${this._$stgSpecial}
			</div>
			${$wrpConfigSettings}
			<div class="ve-flex-v-center mt-auto">${this._$btnOpenImporter}${$btnOpenConfig}</div>`;

		const $wrpPackageImport = await this._pFillUi_$pGetWrpPackageImport();
		this._$panel3_btnImportPackage = this._$panel3_btnImportPackage || $(`<button class="mt-auto btn btn-5et" disabled>Import Package</button>`);

		this._$panel3_tab2 = $$`
			${$wrpPackageImport}
			${this._$panel3_btnImportPackage}`;

		this._$panel3WrpTabs = await this._pFillUi_$pGetPanel3WrpTabs();

		$$(this._$panel3WrpConfig)`
			${this._$panel3WrpTabs}
			${this._$panel3_tab1}
			${this._$panel3_tab2}
		`;
	}

	_pFillUi_$pGetPanel3WrpTabs () {
		const $btnTab1 = $(`<button class="btn btn-default w-50 btn-5et">Actors/Items/Journal</button>`)
			.click(() => this._comp.set("ixTabPanel3", 0));
		const $btnTab2 = $(`<button class="btn btn-default w-50 btn-5et">World/Module</button>`)
			.click(() => this._comp.set("ixTabPanel3", 1));
		const hkActiveTab = () => {
			const ixActiveTab = Number(this._comp.get("ixTabPanel3") || 0);
			$btnTab1.toggleClass("active", ixActiveTab === 0);
			$btnTab2.toggleClass("active", ixActiveTab === 1);
			this._$panel3_tab1.toggleVe(ixActiveTab === 0);
			this._$panel3_tab2.toggleVe(ixActiveTab === 1);
		};
		this._comp.addHook("ixTabPanel3", hkActiveTab);
		this._trackUiHook("ixTabPanel3", hkActiveTab);
		hkActiveTab();

		return $$`<div class="ve-flex btn-group mb-2 w-100">${$btnTab1}${$btnTab2}</div>`;
	}

	/** Special, "Adventures"/"Books"-only section, which presents a package to import, if it exists. */
	async _pFillUi_$pGetWrpPackageImport () {
		const $out = $(`<div class="ve-flex-col h-100 w-100"></div>`);

		const $ovrLoading = await UtilApplications.$pGetAddAppLoadingOverlay($out);

		this._pPackageIndex = this._pPackageIndex || (async () => {
			this._packageIndex = await ImportSpecialPackages.getMergedPackageIndex();
		})();

		this._pPackageIndex.then(() => {
			if ($ovrLoading) $ovrLoading.remove();

			const hkPackageSource = () => {
				const packageSourceClean = this._comp.get("packageSource") ? this._comp.get("packageSource").toLowerCase() : null;
				const availablePackage = (this._packageIndex?.packages || []).find(it => (it.source || "").toLowerCase() === packageSourceClean);

				if (availablePackage) {
					const hasModule = !!availablePackage.manifesturlModule;
					const hasWorld = !!availablePackage.manifesturlWorld;

					const $iptModule = $(`<input class="mr-1" type="radio" name="package-mode" ${hasModule ? "" : `disabled title="No module available."`} ${hasModule ? `checked` : ""}>`);
					const $iptWorld = $(`<input class="mr-1" type="radio" name="package-mode" ${hasWorld ? "" : `disabled title="No world available."`} ${!hasModule && hasWorld ? `checked` : ""}>`);

					$$($out.empty())`
						<div class="mb-1">Import As:</div>
						<label class="ve-flex-v-center mb-1">
							<div class="ve-flex-v-center col-3">${$iptModule}<b class="mr-1">Module</b></div>
							<div class="col-9">
								A resource which can be used in this and other worlds. Usually includes a selection of compendiums.
							</div>
						</label>
						<label class="ve-flex-v-center">
							<div class="ve-flex-v-center col-3">${$iptWorld}<b class="mr-1">World</b></div>
							<div class="col-9">
								A complete world, ready to be run. This is imported as a new, separate world; your current world will not be affected.
							</div>
						</label>
					`;

					this._$panel3_btnImportPackage
						.prop("disabled", false)
						.off("click")
						.click(async () => {
							const isModule = $iptModule.prop("checked");
							const isWorld = $iptWorld.prop("checked");

							if (isModule) await ImportSpecialPackages.pImportManifesturlModule(availablePackage.manifesturlModule);
							else if (isWorld) await ImportSpecialPackages.pImportManifesturlWorld(availablePackage.manifesturlWorld);
							else ui.notifications.warn(`Please select an import mode first!`);
						});
				} else {
					if (Config.get("importAdventure", "isUseLegacyImporter")) {
						$$($out.empty())`<div class="ve-flex-col mb-1">
							<p><i>No world/module package available.</i></p>
						</div>`;
					} else {
						$$($out.empty())`<div class="ve-flex-col mb-1">
							${ImportSpecialPackages.getNonLegacyNoteHtml()}
							<hr class="hr-2">
							<p><i class="ve-muted">No world/module package available.</i></p>
						</div>`;
						ImportSpecialPackages.bindNonLegacyNoteHandlers($out);
					}

					this._$panel3_btnImportPackage
						.prop("disabled", true)
						.off("click");
				}
			};
			this._comp.addHook("packageSource", hkPackageSource);
			this._trackUiHook("packageSource", hkPackageSource);
			hkPackageSource();
		}).catch(e => {
			$ovrLoading.remove();
			$out.append(`<div class="bold veapp__msg-error">Failed to load!</div>`);
			ui.notifications.error(`Failed to load package (worlds/modules) index! The package importer may not function correctly. ${VeCt.STR_SEE_CONSOLE}`);
			throw e;
		});

		return $out;
	}

	async _pFillUi_$pGetWrpConfigSettings () {
		const $cbKeepOpen = ComponentUiUtil.$getCbBool(this.__comp, "isRemainOpen");

		const $wrpSharedConfig = $$`<div class="w-100 ve-flex-col mb-1">
			${!this._isAlwaysCloseWindow ? $$`<label class="w-100 mb-1 split-v-center" title="If this Import Wizard window should be kept open after clicking &quot;Open Importer&quot;">
				<div>Keep Window Open</div>${$cbKeepOpen}
			</label>` : ""}
		</div>`;

		if (this._actor != null || this._isTemp) {
			this._importer.pack = null;
			return $wrpSharedConfig;
		}

		if (this._table != null) {
			// The importer's `.pack` is set by an earlier step.
			return $wrpSharedConfig;
		}

		const $wrpEditFolderPath = $$`<div class="w-100 ve-flex-col"></div>`;
		const pathBuilder = new FolderPathBuilder({fpApp: this._importer, folderType: this._importer.constructor.FOLDER_TYPE});
		pathBuilder.render($wrpEditFolderPath);

		if (this._importer.isFolderOnly) {
			return $$`<div class="ve-flex-col w-100">
				${$wrpSharedConfig}
				${$wrpEditFolderPath}
			</div>`;
		}

		const availPacks = UtilCompendium.getAvailablePacks({folderType: this._importer.constructor.FOLDER_TYPE});

		let isImportToCompendium = await StorageUtil.pGet(this.constructor._getImportToPackKey(this._importer)) || false;

		const getSelectedCompendium = () => {
			const toFind = $selCompendium.val() == null ? availPacks.length ? availPacks[0].collection : null : $selCompendium.val();
			return UtilCompendium.getPackByCollection({collection: toFind});
		};

		const setCompendiumImport = (isCompendium) => {
			isImportToCompendium = isCompendium;

			const pack = getSelectedCompendium();
			if (!pack && isCompendium) {
				setCompendiumImport(false);
				ui.notifications.warn(`No unlocked/compatible compendiums found for type "${this._importer.constructor.FOLDER_TYPE}." You need to create one first! (If you have created one already, you may need to re-open the Wizard.)`);
				return;
			}

			$btnImportFolder.toggleClass("btn--active", !isImportToCompendium);
			$btnImportCompendium.toggleClass("btn--active", isImportToCompendium);

			$tabImportFolder.toggleVe(!isImportToCompendium);
			$tabImportCompendium.toggleVe(isImportToCompendium);

			this._importer.pack = isImportToCompendium ? getSelectedCompendium() : null;

			StorageUtil.pSet(this.constructor._getImportToPackKey(this._importer), isImportToCompendium).then(null);
			StorageUtil.pSet(this.constructor._getPackSelectionKey(this._importer), $selCompendium.val()).then(null);
		};

		const $btnImportFolder = $(`<button class="btn btn-5et imp-wiz__btn-tab-head imp-wiz__btn-tab-head--left w-50 ml-2 ${isImportToCompendium ? "" : "btn--active"}">Import to Folder</button>`)
			.click(() => setCompendiumImport(false));

		const $btnImportCompendium = $(`<button class="btn btn-5et imp-wiz__btn-tab-head imp-wiz__btn-tab-head--right w-50 mr-2 ${isImportToCompendium ? "" : "btn--active"}">Import to Compendium</button>`)
			.click(() => setCompendiumImport(true));

		const $selCompendium = UtilCompendium.$getSelCompendium({availablePacks: availPacks})
			.change(() => {
				setCompendiumImport(isImportToCompendium);
			});

		const savedCollectionId = await StorageUtil.pGet(this.constructor._getPackSelectionKey(this._importer));
		if (isImportToCompendium && availPacks.some(it => it.collection === savedCollectionId)) $selCompendium.val(savedCollectionId);
		else if (availPacks.length) $selCompendium.val(availPacks[0].collection);

		const $tabImportFolder = $$`<div class="w-100 h-100 ve-flex-col imp-wiz__tab-config py-1">
			${$wrpEditFolderPath}
		</div>`;

		const $tabImportCompendium = $$`<div class="w-100 h-100 ve-flex-col imp-wiz__tab-config py-1">
			<div class="mb-1">Compendium <span class="ve-muted ve-small">(<span class="code">${this._importer.constructor.FOLDER_TYPE}</span>)</span>:</div>
			${$selCompendium}
		</div>`;

		const $wrpConfig = $$`<div class="ve-flex-col w-100 min-h-0">
			${$wrpSharedConfig}
			<div class="ve-flex">${$btnImportFolder}${$btnImportCompendium}</div>
			${$tabImportFolder}
			${$tabImportCompendium}
		</div>`;

		setCompendiumImport(isImportToCompendium);

		return $wrpConfig;
	}

	async _pDoQuickOpen (mode) {
		const importer = mode.Importer ? new mode.Importer({actor: this._actor, table: this._table}) : mode.importerInstance;
		await importer.pInit();

		await this._pInitImporter(mode);
		await this._pInitSourceSelector();
		const sources = await this._appSourceSelector.pGetSelectedSources();
		if (!sources.length) return ui.notifications.error(`No source(s) selected!`);
		await this._pHandleOpenImporter(sources, {importer, mode});
	}

	async pDoQuickOpenUsingExistingSourceSelection ({isSilent = false, isBackground = false} = {}) {
		await this._pInitImporter(this._getMode());
		await this._pInitSourceSelector();
		const sources = await this._appSourceSelector.pGetSelectedSources();
		if (!isSilent && !sources.length) return ui.notifications.error(`No source(s) selected!`);
		await this._pHandleOpenImporter(sources, {isSilent, isBackground});
	}

	_pFillUi_$getBtnOpenImporter () {
		return $(`<button class="btn btn-5et w-100 mr-2">${this._predefinedMode?.wizardTitleButtonOpenImporter || "Open Importer"}</button>`)
			.click(async () => {
				const sources = await this._appSourceSelector.pGetSelectedSources();
				if (!sources.length) return ui.notifications.error(`No source selected!`);
				await this._pHandleOpenImporter(sources);
			});
	}

	_pFillUi_$getBtnOpenConfig () {
		return $(`<button class="btn btn-5et" title="Open ${Config.get("ui", "isStreamerMode") ? "" : "Plutonium "}Config for This Importer"><span class="fas fa-fw fa-cogs"></span></button>`)
			.click(evt => Config.pHandleButtonClick(evt, this._importer.configGroup));
	}

	/**
	 * @param sources
	 * @param importer The importer to use; pass this in so it can be set distinct from the main importer mode (e.g. for
	 * opening "quick" importers)
	 * @param mode
	 * @param isSilent
	 * @param isBackground
	 */
	async _pHandleOpenImporter (sources, {importer = null, mode = null, isSilent = false, isBackground = false} = {}) {
		importer = importer || this._importer;
		mode = mode || this._getMode();

		await this._pHandleOpenImporter_pSaveLastUsed(importer, mode);

		const allContentMeta = await this._pHandleOpenImporter_pGetAllContent({importer, sources, isBackground});
		if (!allContentMeta) return;

		const {dedupedAllContentMerged, cacheKeys, userData} = allContentMeta;

		importer.userData = userData;

		if (
			!isSilent
			&& (!Object.values(dedupedAllContentMerged || {}).length)
		) {
			ui.notifications.warn(`No importable content found in the selected source${sources.length === 1 ? "" : "s"}!`);
			return;
		}

		// If any cache key is null, make the entire thing null
		const cacheKey = cacheKeys.includes(null) ? null : cacheKeys.join("__");
		await this._pFillUi_handleOpenClick_pOpen(importer, dedupedAllContentMerged, cacheKey);
	}

	async _pHandleOpenImporter_pGetAllContent ({importer, sources, isBackground}) {
		const $ovrLoading = await UtilApplications.$pGetAddAppLoadingOverlay(this._$window);

		try {
			return (await importer.pGetAllContent({
				sources,
				isBackground,
				uploadedFiles: this._appSourceSelector.uploadedFiles,
				customUrls: this._appSourceSelector.getCustomUrls(),
			}));
		} catch (e) {
			ui.notifications.error(`Failed to load importer! ${VeCt.STR_SEE_CONSOLE}`);
			throw e;
		} finally {
			if ($ovrLoading) $ovrLoading.remove();
		}
	}

	async _pHandleOpenImporter_pSaveLastUsed (importer, mode) {
		if (!importer || !mode) return;
		// Avoid crashing the import if this fails
		try {
			const toSave = MiscUtil.copy((await StorageUtil.pGet(ChooseImporter._STORAGE_KEY_LAST_USED_MODE)) || {});
			toSave[importer.gameProp] = mode.id;
			await StorageUtil.pSet(ChooseImporter._STORAGE_KEY_LAST_USED_MODE, toSave);
		} catch (e) {
			console.error(...LGT, e);
		}
	}

	async _pFillUi_handleOpenClick_pOpen (importer, dedupedAllContentMerged, cacheKey) {
		if (dedupedAllContentMerged == null || !Object.keys(dedupedAllContentMerged).length) return;

		const isOpenedFromCache = await this._pGetUi_pCheckOpenCachedInstance(importer, {fnCheckHit: cached => cached.cacheKey && cached.cacheKey === cacheKey && cached.hasActor === !!this._actor && cached.hasTable === !!this._table});
		if (isOpenedFromCache) {
			if (this._isAlwaysCloseWindow || !this._comp.get("isRemainOpen")) this.close();
			return;
		}

		if (this._isAlwaysCloseWindow || !this._comp.get("isRemainOpen")) this.close();

		await importer.pSetContent(dedupedAllContentMerged);

		await importer.pPreRender(this._importerPreRenderArgs);
		// As a single importer instance is used per category, we ensure it is not hidden (after e.g. being "closed")
		const pRender = importer.showAndRender(true);

		this._pGetUi_cacheInstance(importer, {cacheKey: cacheKey, hasActor: !!this._actor, hasTable: !!this._table});

		await pRender;
		if (Config.get("ui", "isEnableSubPopouts") && PopoutSheet.isPoppedOut(this)) {
			PopoutSheet.doPopout(importer);
		}
	}

	async _pGetUi_pCheckOpenCachedInstance (importer, {fnCheckHit}) {
		const instanceCacheKey = this._getInstanceCacheKey(importer);
		const cachedInstanceMeta = ChooseImporter._INSTANCE_CACHE[instanceCacheKey];

		if (!cachedInstanceMeta) return false;

		// If the instance in the cache did not match, empty the cache and close the instance
		if (!fnCheckHit(cachedInstanceMeta)) {
			this.constructor._uncacheInstance(instanceCacheKey);
			return false;
		}

		// Sync our state to the old instance
		await cachedInstanceMeta.instance.pSyncStateFrom(importer);

		await cachedInstanceMeta.instance.pPreRender(this._importerPreRenderArgs);
		cachedInstanceMeta.instance.render(true);
		cachedInstanceMeta.instance.maximize();
		UtilApplications.bringToFront(cachedInstanceMeta.instance);

		return true;
	}

	_pGetUi_cacheInstance (importer, instanceMeta) {
		const instanceCacheKey = this._getInstanceCacheKey(importer);

		if (importer.isNonCacheableInstance || instanceMeta.cacheKey == null) return;

		importer.isClosable = false;
		ChooseImporter._INSTANCE_CACHE[instanceCacheKey] = {
			...instanceMeta,
			instance: importer,
		};
	}

	static _uncacheInstance (instanceCacheKey) {
		const cachedInstanceMeta = ChooseImporter._INSTANCE_CACHE[instanceCacheKey];
		delete ChooseImporter._INSTANCE_CACHE[instanceCacheKey];
		cachedInstanceMeta.instance.isClosable = true;
		cachedInstanceMeta.instance.close();
	}

	static _getSourceSelectionKey (importer) { return `ChooseImporter_source_${importer.namespace || importer.props.join("_")}`; }
	static _getImportToPackKey (importer) { return `ChooseImporter_is_pack_${importer.namespace || importer.props.join("_")}`; }
	static _getPackSelectionKey (importer) { return `ChooseImporter_pack_${importer.namespace || importer.props.join("_")}`; }

	// Use the same generalised filters across all importers
	_getFilterNamespace () { return `ChooseImporter_source_filter`; }

	_getInstanceCacheKey (importer) {
		const sourceKey = this.constructor._getSourceSelectionKey(importer);
		return [sourceKey, this._namespace].join("_");
	}

	async close (...args) {
		if (this._appSourceSelector) this._appSourceSelector.handlePreClose();
		await super.close(...args);
		if (this._appSourceSelector) this._appSourceSelector.handlePostClose();
	}

	async _pForceClose () {
		this._isClosable = true;
		await this.close();
	}
}
ChooseImporter._DEFAULT_STATE = {
	modeId: "adventures",
	isRemainOpen: true,
	ixTabPanel3: 0,
	packageSource: null,
};

ChooseImporter._STORAGE_KEY_LAST_USED_MODE = "choose_importer_last_used_mode";

ChooseImporter.Mode = class {
	constructor (
		{
			Importer,
			hasDefaultSource,
			singleName,
			requires,
			metaExternalArchive,
			metaOther,
			hasPackages,
			id,
			name,
			isNotAllable,

			importerInstance,
			wizardTitleWindow,
			wizardTitlePanel3,
			wizardTitleButtonOpenImporter,
		},
	) {
		this.Importer = Importer;
		this.hasDefaultSource = hasDefaultSource;
		this.singleName = singleName;
		this.requires = requires;
		this.metaExternalArchive = metaExternalArchive;
		this.metaOther = metaOther;
		this.hasPackages = hasPackages;
		this._id = id;
		this._name = name;
		this.isNotAllable = !!isNotAllable;

		this.importerInstance = importerInstance;
		this.wizardTitleWindow = wizardTitleWindow;
		this.wizardTitlePanel3 = wizardTitlePanel3;
		this.wizardTitleButtonOpenImporter = wizardTitleButtonOpenImporter;
	}

	get id () { return this._id ?? this.Importer.ID; }
	get name () { return this._name ?? this.Importer.DISPLAY_NAME_TYPE_PLURAL; }
};

ChooseImporter._MODES = [
	new ChooseImporter.Mode({
		Importer: ImportListAction,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		singleName: "Adventure",
		Importer: ImportListAdventure,
		requires: {
			actor: false,
			table: false,
		},
		/* Legacy option, retained here as a reference */
		// metaExternalArchive: {
		// 	text: "Worlds",
		// 	url: "https://thetrove.net/Resources/Programs/Plutonium/index.html"
		// },
		metaOther: {
			text: "Packages",
			pFn: async () => {
				const importSpecialPackages = new ImportSpecialPackages();
				await importSpecialPackages.pInit();
				return importSpecialPackages.render(true);
			},
		},
		hasPackages: true,
		isNotAllable: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListBackground,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListBackgroundFeature,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		singleName: "Book",
		Importer: ImportListBook,
		requires: {
			actor: false,
			table: false,
		},
		hasPackages: true,
		isNotAllable: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListCharCreationOption,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListClass,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListClassFeature,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListConditionDisease,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListCreature,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	// region TODO(v10)
	// new ChooseImporter.Mode({
	// 	Importer: ImportListCreatureFeature,
	// 	hasDefaultSource: true,
	// }),
	// endregion
	new ChooseImporter.Mode({
		Importer: ImportListCultBoon,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListDeity,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListFeat,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListHazard,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListItem,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListLanguage,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListMap,
		requires: {
			actor: false,
		},
		isNotAllable: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListObject,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListVariantRule,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListOptionalFeature,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListPsionic,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListRace,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListRaceFeature,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListRecipe,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListSpell,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListReward,
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListRollableTable,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListTrap,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListVehicle,
		requires: {
			actor: false,
		},
		hasDefaultSource: true,
	}),
	new ChooseImporter.Mode({
		Importer: ImportListVehicleUpgrade,
		hasDefaultSource: true,
	}),
];
ChooseImporter._INSTANCE_CACHE = {};

export {ChooseImporter};
