import {SharedConsts} from "../shared/SharedConsts.js";
import {MixinHidableApplication, UtilApplications} from "./UtilApplications.js";
import {Util} from "./Util.js";
import {UtilList2} from "./UtilList2.js";
import {MixinFolderPathBuilder} from "./FolderPathBuilder.js";
import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {DataConverterTable} from "./DataConverterTable.js";
import {UtilFolders} from "./UtilFolders.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {UtilHooks} from "./UtilHooks.js";
import {UtilActors} from "./UtilActors.js";
import {UtilDocuments} from "./UtilDocuments.js";
import {UtilWorldDataSourceSelector} from "./UtilWorldDataSourceSelector.js";
import {UtilEvents} from "./UtilEvents.js";
import {UtilLibWrapper} from "./PatcherLibWrapper.js";

/**
 * @mixes MixinFolderPathBuilder
 * @mixes MixinHidableApplication
 */
class ImportList extends MixinHidableApplication(MixinFolderPathBuilder(Application)) {
	// region API
	static async api_pImportEntry (entry, {isTemp = false, packId = null} = {}) {
		if (game.user.role < Config.get("import", "minimumRole")) throw new Error(`You do not have sufficient permissions!`);

		const pack = packId ? game.packs.get(packId) : null;
		if (!pack && packId) throw new Error(`Could not find pack "${pack}"`);

		if (isTemp && packId) throw new Error(`Options "isTemp" and "packId" are mutually exclusive!`);

		entry = await entry;
		if (entry == null) throw new Error(`Entry cannot be null/undefined!`);

		const imp = new this();
		await imp.pInit();
		imp.pack = pack;
		return imp.pImportEntry(entry, {isTemp});
	}
	// endregion

	// region External
	static init () {
		// region Patch "fromDropData" to support drag-dropping tags to misc places
		UtilLibWrapper.addPatch(
			"Actor.fromDropData",
			this._lw_Actor_fromDropData,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
		UtilLibWrapper.addPatch(
			"Item.fromDropData",
			this._lw_Item_fromDropData,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
		UtilLibWrapper.addPatch(
			"JournalEntry.fromDropData",
			this._lw_JournalEntry_fromDropData,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
		UtilLibWrapper.addPatch(
			"RollTable.fromDropData",
			this._lw_RollTable_fromDropData,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
		// endregion
	}

	static async _lw_Actor_fromDropData (fn, ...args) {
		const out = await ImportList._pHandleDropGetImportedDoc(args[0]);
		if (out) return out;
		return fn(...args);
	}

	static async _lw_Item_fromDropData (fn, ...args) {
		const out = await ImportList._pHandleDropGetImportedDoc(args[0]);
		if (out) return out;
		return fn(...args);
	}

	static async _lw_JournalEntry_fromDropData (fn, ...args) {
		const out = await ImportList._pHandleDropGetImportedDoc(args[0]);
		if (out) return out;
		return fn(...args);
	}

	static async _lw_RollTable_fromDropData (fn, ...args) {
		const out = await ImportList._pHandleDropGetImportedDoc(args[0]);
		if (out) return out;
		return fn(...args);
	}

	static preInit () {
		UtilLibWrapper.addPatch(
			"ActorDirectory.prototype._onDrop",
			this._lw_ActorDirectory_prototype__onDrop,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);

		UtilLibWrapper.addPatch(
			"Compendium.prototype._onDrop",
			this._lw_Compendium_prototype__onDrop,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
	}

	static async _lw_ActorDirectory_prototype__onDrop (fn, ...args) {
		if (await ImportList._pHandleSidebarDrop(this, ...args)) return;
		return fn(...args);
	}

	static async _lw_Compendium_prototype__onDrop (fn, ...args) {
		const data = UtilEvents.getDropJson(args[0]);
		const out = await ImportList._pHandleDropGetImportedDoc(data, {pack: this.collection});
		if (out) return out;
		return fn(...args);
	}
	// endregion

	static get ID () { throw new Error("Unimplemented!"); }
	static get DISPLAY_NAME_TYPE_PLURAL () { throw new Error("Unimplemented!"); }

	static IMPLS = new Map();

	static registerImpl (Impl) {
		if (!Impl.ID || this.IMPLS.get(Impl.ID)) throw new Error(`Duplicate or missing importer ID! Importer "${Impl.name}" ID was "${Impl.ID}".`);
		this.IMPLS.set(Impl.ID, Impl);
		ConfigConsts.registerImporter({id: Impl.ID, name: Impl.DISPLAY_NAME_TYPE_PLURAL});
		return this.IMPLS;
	}

	static get FOLDER_TYPE () { return "Item"; }

	/**
	 * Check if the incoming event/data has the `page`, `source`, `hash` info we require to fetch/import it.
	 */
	static _isImporterDropEvent ({evt, data}) {
		if (!evt && !data) return false; // Should never occur

		if (!data) data = UtilEvents.getDropJson(evt);

		if (data.subType !== UtilEvents.EVT_DATA_SUBTYPE__HOVER && data.subType !== UtilEvents.EVT_DATA_SUBTYPE__IMPORT) return false;

		return data.page && data.source && data.hash;
	}

	static async patcher_pHandleActorDrop (evt) {
		const data = UtilEvents.getDropJson(evt);

		if (!ImportList._isImporterDropEvent({evt})) return;

		const doc = await ImportList._pHandleDropGetImportedDoc(data);
		if (!doc) return;

		// Hack to suppress the "Use Importer?" prompt
		//   We can't set the flag on the item, as Foundry's drag-drop handler re-fetches from the collection.
		//   Doing anything more permanent (e.g. setting the flag and saving the doc) would pollute later drag-drops.
		ImportList._suppressCreateSheetItemHookTimeStart = Date.now();

		const evtNxt = new DragEvent(
			"drop",
			{
				"dataTransfer": new DataTransfer(),
			},
		);
		evtNxt.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				type: doc.documentName,
				id: doc.id,
			}),
		);
		return this._onDrop(evtNxt);
	}

	static async _pHandleSidebarDrop (sidebar, evt) {
		const data = UtilEvents.getDropJson(evt);

		if (!ImportList._isImporterDropEvent({evt})) return;

		await ImportList._pHandleDropGetImportedDoc(data, {requiresDocumentName: sidebar.constructor.documentName});

		return true;
	}

	static async _pHandleDropGetImportedDoc (data, {requiresDocumentName = null, pack = null} = {}) {
		if (!ImportList._isImporterDropEvent({data})) return null;

		const entity = await Renderer.hover.pCacheAndGet(data.page, data.source, data.hash, {isCopy: true});

		const {ChooseImporter} = await import("./ChooseImporter.js");
		const importer = ChooseImporter.getImporter(entity?.__prop || data.page);
		if (pack) importer.pack = pack;

		if (requiresDocumentName != null && importer.constructor.FOLDER_TYPE !== requiresDocumentName) return null;

		return (await importer.pImportEntry(entity)).imported[0]?.document;
	}

	static _initCreateSheetItemHook (
		{
			prop,
			importerName,
			isForce,
			pFnGetEntity,
			pFnImport,
			fnGetSuccessMessage,
			fnGetFailedMessage,
		},
	) {
		// Note that this breaks the case where a user manually calls `actor.createEmbeddedDocuments` with an array of
		//   Plutonium-flagged items--the pre-create hook gets passed only one of these items, and `return false`s
		//   the rest.
		// ...or at least, this _was_ the case in 0.7.x; post-0.8.x this may have changed.
		Hooks.on("preCreateItem", (item, itemData, options, itemId) => {
			if (item.parent?.documentName !== "Actor") return;

			const flags = itemData.flags?.[SharedConsts.MODULE_NAME_FAKE] || itemData.flags?.[SharedConsts.MODULE_NAME];
			if (!flags || flags?.propDroppable !== prop) return;
			if (flags.isStandardDragDrop || flags.isDirectImport) return;

			// region Hack to suppress the "Use Importer?" prompt when drag-dropping importer list items to sheets
			//   Limit the suppression period to a max of 10 seconds, to minimize the likelihood of getting stuck in a bad
			//   state.
			if (
				ImportList._suppressCreateSheetItemHookTimeStart != null
				&& (Date.now() - ImportList._suppressCreateSheetItemHookTimeStart) < 10_000
			) {
				ImportList._suppressCreateSheetItemHookTimeStart = null;
				return;
			}
			ImportList._suppressCreateSheetItemHookTimeStart = null;
			// endregion

			const actor = item.parent;

			this._pGetUseImporterDragDrop({isForce})
				.then(async isUseImporter => {
					// Completely cancel the drag-drop if the user cancelled the dialogue
					if (isUseImporter == null) return;

					let ent;
					try {
						if (pFnGetEntity) ent = await pFnGetEntity(flags);
						else ent = await Renderer.hover.pCacheAndGet(flags.page, flags.source, flags.hash);
					} catch (e) {
						ui.notifications.error(`Failed to import "${ent?.name ?? flags.hash}"! ${VeCt.STR_SEE_CONSOLE}`);
						throw e;
					}

					if (!ent) {
						const msg = `Failed to import "${flags.hash}"!`;
						ui.notifications.error(`${msg} ${VeCt.STR_SEE_CONSOLE}`);
						throw new Error(`${msg} The original entity could not be found.`);
					}

					try {
						if (isUseImporter) {
							const imp = new this({actor});
							await imp.pInit();

							if (pFnImport) await pFnImport({ent, imp, flags});
							else await imp.pImportEntry(ent, {filterValues: flags.filterValues});

							const msg = fnGetSuccessMessage ? fnGetSuccessMessage({ent, flags}) : `Imported "${ent.name}" via ${importerName} Importer`;
							ui.notifications.info(msg);
							return;
						}

						itemData = MiscUtil.copy(itemData);
						MiscUtil.set(itemData.flags, SharedConsts.MODULE_NAME_FAKE, "isStandardDragDrop", true);
						await UtilActors.pAddActorItems(actor, [itemData]);
					} catch (e) {
						const msg = fnGetFailedMessage ? fnGetFailedMessage({ent, flags}) : `Failed to import "${ent.name}"! ${VeCt.STR_SEE_CONSOLE}`;
						ui.notifications.error(msg);
						throw e;
					}
				});

			return false;
		});
	}

	static async _pGetUseImporterDragDrop ({isForce}) {
		if (isForce) return true;

		const dragDropMode = Config.get("import", "dragDropMode");
		if (dragDropMode === ConfigConsts.C_IMPORT_DRAG_DROP_MODE_NEVER) return false;

		if (dragDropMode === ConfigConsts.C_IMPORT_DRAG_DROP_MODE_PROMPT) {
			return InputUiUtil.pGetUserBoolean({
				title: `Import via ${Config.get("ui", "isStreamerMode") ? "SRD Importer" : SharedConsts.MODULE_TITLE}? Note that this will ignore any in-Foundry modifications made to the item.`,
				textYes: "Yes, use the importer",
				textNo: "No, use normal drag-drop",
			});
		}

		return true;
	}

	/**
	 * @param applicationOpts Application options. Accepts the same options as `Application`.
	 * @param [externalData] External data, passed in on creating the importer.
	 * @param [externalData.actor] Actor this importer belongs to.
	 * @param [externalData.table] RollableTable this importer belongs to.
	 * @param subclassOpts Options provided by subclasses to specify basic behaviour.
	 * @param [subclassOpts.props] JSON data properties for this entity (e.g. `["monster"]`).
	 * @param [subclassOpts.propsBrewAdditionalData] JSON data properties for additional data for this entity (e.g. `["foundryMonster"]`).
	 * @param [subclassOpts.dirsHomebrew] Homebrew directories for this entity (e.g. `["creature"]`)
	 * @param [subclassOpts.gameProp] Property on `game` object where the collection containing this FVTT entity type is stored.
	 * @param [subclassOpts.titleSearch] Used in prompt text in the search bar.
	 * @param [subclassOpts.sidebarTab] Sidebar tab to open when importer is made active, assuming we're not targeting an actor.
	 * @param [subclassOpts.defaultFolderPath] Default folder path under which content imported should be stored.
	 * @param [subclassOpts.fnListSort] Sort function for list items.
	 * @param [subclassOpts.listInitialSortBy] Initial "sort by" value for list items.
	 * @param [subclassOpts.pageFilter] Page filter instance for this importer.
	 * @param [subclassOpts.namespace] Namespace for this importer (will be prefixed as required (e.g. with "importer_") when used)
	 * @param [subclassOpts.isFolderOnly] If this importer may only target folder (and not compendiums)
	 * @param [subclassOpts.isActorRadio] If this importer is in "radio" mode when an actor is being imported.
	 * @param [subclassOpts.isNonCacheableInstance] If instances of this importer should never be cached.
	 * @param [subclassOpts.page] An associated 5etools page for this entity type.
	 * @param [subclassOpts.isPreviewable] If this importer list should have hoverable previews.
	 * @param [subclassOpts.isNotDroppable] If rows in this importer list should not be droppable to canvas/etc..
	 * @param [subclassOpts.titleButtonRun] Run button text.
	 * @param [subclassOpts.isDedupable] If a dedupe step should be run on importer content.
	 * @param [subclassOpts.fnLoadSideData] Function which loads side data.
	 * @param [subclassOpts.configGroup] The primary config group for this importer.
	 */
	constructor (applicationOpts, externalData, subclassOpts) {
		subclassOpts = subclassOpts || {};

		if (!subclassOpts.props && !subclassOpts.namespace) throw new Error(`One of "props" or "namespace" must be provided!`);

		const allApplicationOpts = {
			template: `${SharedConsts.MODULE_LOCATION}/template/ImportList.hbs`,
			width: 960,
			height: Util.getMaxWindowHeight(),
			resizable: true,
		};
		Object.assign(allApplicationOpts, applicationOpts || {});
		super(allApplicationOpts);

		// Fields for descendants to override
		this._props = subclassOpts.props;

		// region TODO link this with "props" to make a "propGroups" option
		this._propsBrewAdditionalData = subclassOpts.propsBrewAdditionalData;
		if (this._props && this._propsBrewAdditionalData && this._props.length !== this._propsBrewAdditionalData.length) throw new Error(`Mismatched number of properties! This is a bug!`);
		// endregion

		this._dirsHomebrew = subclassOpts.dirsHomebrew;

		this._titleSearch = subclassOpts.titleSearch || "entries";
		this._sidebarTab = subclassOpts.sidebarTab;
		this._gameProp = subclassOpts.gameProp;
		this._defaultFolderPath = subclassOpts.defaultFolderPath;
		this._fnListSort = subclassOpts.fnListSort;
		this._listInitialSortBy = subclassOpts.listInitialSortBy;
		this._pageFilter = subclassOpts.pageFilter;
		this._namespace = subclassOpts.namespace;
		this._isFolderOnly = !!subclassOpts.isFolderOnly;
		this._isNonCacheableInstance = subclassOpts.isNonCacheableInstance;
		this._page = subclassOpts.page;
		this._isPreviewable = !!subclassOpts.isPreviewable;
		this._isNotDroppable = !!subclassOpts.isNotDroppable;
		this._titleButtonRun = subclassOpts.titleButtonRun || "Import";
		this._isDedupable = !!subclassOpts.isDedupable;
		this._fnLoadSideData = subclassOpts.fnLoadSideData;
		this._configGroup = subclassOpts.configGroup;

		// region Local fields
		// Fields that require synchronization
		this._actor = externalData?.actor;
		this._table = externalData?.table;
		this._isRadio = !!externalData?.actor && subclassOpts.isActorRadio;
		this._pack = null;
		this._packCache = null;
		this._packCacheFlat = null;

		this._isInit = false;
		this._content = null;
		this._list = null;
		this._uploadedFile = null; // This doesn't require syncing, as there is no cache/reload for from-file importers

		this._$bntFilter = null;
		this._$btnReset = null;
		this._$btnFeelingLucky = null;
		this._$btnToggleSummary = null;
		this._$iptSearch = null;
		this._$dispNumVisible = null;
		this._$cbAll = null;
		this._$btnTogglePreviewAll = null;
		this._$wrpRun = null;
		this._$btnRun = null;
		this._$btnsRunAdditional = {};
		this._$wrpBtnsSort = null;
		this._$wrpList = null;
		this._$wrpMiniPills = null;
		// endregion

		// Arbitrary data which is specific to each importer, and set each time it is opened
		this._userData = null;
	}

	get page () { return this._page; }
	get namespace () { return this._namespace; }
	get props () { return this._props; }
	set pack (val) { this._pack = val; }
	get isFolderOnly () { return this._isFolderOnly; }
	get isNonCacheableInstance () { return !!this._isNonCacheableInstance; }
	get isDedupable () { return !!this._isDedupable; }
	set userData (val) { this._userData = val; }

	get gameProp () { return this._gameProp; }
	get actor () { return this._actor; }
	get table () { return this._table; }
	get configGroup () { return this._configGroup; }

	get _propGroups () { return this._props.map((prop, i) => ({prop, propBrewAdditionalData: this._propsBrewAdditionalData?.[i]})); }

	async pSetContent (val) {
		// Some importers (e.g. adventure/book) have non-array content, and are always single objects
		if (!this._props?.length) {
			this._content = val;
			return;
		}

		let content = [];
		Object.entries(val)
			.forEach(([k, arr]) => {
				if (!this._props.includes(k)) return;
				content = [...content, ...arr];
			});
		this._content = content;
	}

	async pSyncStateFrom (that) {
		this._actor = that._actor;
		this._table = that._table;
		this._pack = that._pack;
		await this.pSetFolderPathSpec(that._folderPathSpec);
	}

	async _close_isAlwaysHardClose () {
		return !!this._isNonCacheableInstance;
	}

	async _close_doHardCloseTeardown () {
		if (this._pageFilter?.filterBox) this._pageFilter.filterBox.teardown();
	}

	isInvalidatedByConfigChange (configDiff) { return false; }

	async pPreRender () {}

	activateSidebarTab ({sidebarTab = null} = {}) {
		sidebarTab = sidebarTab || this._sidebarTab;

		if (this._table) ui.sidebar.activateTab("tables");
		if (this._pack) ui.sidebar.activateTab("compendium");
		else if (!this._actor && !this._table && sidebarTab) ui.sidebar.activateTab(sidebarTab);
	}

	async pInit () {
		if (this._isInit) return;
		this._isInit = true;
		// Do initial load
		await this._pInit_folderPathSpec();
	}

	_getFullFolderPathSpecKey () { return `${ImportList._STO_K_FOLDER_PATH_SPEC}.${this._folderPathSpecKeyConstructorName}`; }
	get _folderPathSpecKeyConstructorName () { return this.constructor.name; }

	/**
	 * Used by template engine. This runs before `activateListeners` .
	 * Overwrite as required.
	 */
	getData () {
		return {
			isRadio: this._isRadio,
			isPreviewable: this._isPreviewable,
			isNotDroppable: this._isNotDroppable,
			titleButtonRun: this._titleButtonRun,
			titleSearch: this._titleSearch,
			cols: [
				{
					name: "Name",
					width: 9,
					field: "name",
				},
				{
					name: "Source",
					width: 2,
					field: "source",
					titleProp: "sourceLong",
					displayProp: "sourceShort",
					classNameProp: "sourceClassName",
					styleProp: "sourceStyle",
					rowClassName: "text-center",
				},
			],
			rows: this._content.map((it, ix) => {
				if (this._pageFilter) this._pageFilter.constructor.mutateForFilters(it);

				return {
					name: it.name,
					source: it.source,
					sourceShort: Parser.sourceJsonToAbv(it.source),
					sourceLong: Parser.sourceJsonToFull(it.source),
					sourceClassName: Parser.sourceJsonToColor(it.source),
					sourceStyle: BrewUtil2.sourceJsonToStylePart(it.source),
					ix,
				};
			}),
		};
	}

	_renderInner_doFindUiElements ($html) {
		const root = $html[0];

		const $wrpFilterControls = $(root.children[0]);
		this._$bntFilter = $wrpFilterControls.find(`[name="btn-filter"]`);
		this._$btnReset = $wrpFilterControls.find(`[name="btn-reset"]`);
		this._$btnFeelingLucky = $wrpFilterControls.find(`[name="btn-feeling-lucky"]`);
		this._$btnToggleSummary = $wrpFilterControls.find(`[name="btn-toggle-summary"]`);
		this._$iptSearch = $wrpFilterControls.find(`.search`);
		this._$dispNumVisible = $wrpFilterControls.find(`.lst__wrp-search-visible`);

		this._$wrpMiniPills = $(root.children[1]);

		const $wrpBtnsSort = $(root.children[2]);
		this._$cbAll = $wrpBtnsSort.find(`[name="cb-select-all"]`);
		this._$btnTogglePreviewAll = $wrpBtnsSort.find(`[name="btn-toggle-all-previews"]`);
		this._$wrpBtnsSort = $wrpBtnsSort;

		this._$wrpList = $(root.children[3]);

		this._$wrpRun = $(root.children[4]);
		this._$btnRun = this._$wrpRun.find(`[name="btn-run"]`);

		this._$wrpRun
			.find(`[name]`)
			.each((i, e) => {
				if (e.name === "btn-run") return;
				this._$btnsRunAdditional[e.name] = $(e);
			});
	}

	async _renderInner (data) {
		const $html = await super._renderInner(data);
		await this._renderInner_custom($html);
		return $html;
	}

	async _renderInner_custom ($html) {
		this._renderInner_doFindUiElements($html);

		this._renderInner_initRunButton();
		this._renderInner_initRunButtonsAdditional();

		this._renderInner_initSearchKeyHandlers();

		const doResetSearch = () => {
			if (this._$iptSearch) this._$iptSearch.val("");
			if (this._list) this._list.reset();
		};

		this._$btnReset.click(() => {
			doResetSearch();
		});

		this._renderInner_initFeelingLuckyButton();

		if (this._pageFilter) {
			await this._renderInner_pInitFilteredList();
			await this._renderInner_initPreviewsAndQuicksImportsAndDroppables();
		} else {
			this._renderInner_initList();
		}

		this._list.on("updated", () => this._$dispNumVisible.html(`${this._list.visibleItems.length}/${this._list.items.length}`));
		ListUiUtil.bindSelectAllCheckbox(this._$cbAll, this._list);
		ListUiUtil.bindPreviewAllButton(this._$btnTogglePreviewAll, this._list);

		doResetSearch();
	}

	_renderInner_initFeelingLuckyButton () {
		this._$btnFeelingLucky.click(() => {
			if (!this._list || !this._list.visibleItems.length) return;

			ListUiUtil.setCheckboxes({isChecked: false, isIncludeHidden: true, list: this._list});

			const listItem = RollerUtil.rollOnArray(this._list.visibleItems);
			if (!listItem) return;

			ListUiUtil.setCheckbox(listItem, {toVal: true});

			listItem.ele.scrollIntoView({block: "center"});
		});
	}

	_renderInner_initPreviewsAndQuicksImportsAndDroppables () {
		if (!this._isPreviewable && this._isNotDroppable) return;

		const items = this._list.items;
		const len = items.length;
		for (let i = 0; i < len; ++i) {
			const item = items[i];

			if (this._isPreviewable) {
				const eleControlsWrp = item.ele.firstElementChild.children[1];

				const btnShowHidePreview = eleControlsWrp.children[0];
				const btnImport = eleControlsWrp.children[1];

				this._renderInner_initPreviewButton(item, btnShowHidePreview);
				this._renderInner_initPreviewImportButton(item, btnImport);
			}

			if (!this._isNotDroppable) {
				this._renderInner_initDroppable(item);
			}
		}
	}

	_renderInner_initPreviewButton (item, btnShowHidePreview) {
		ListUiUtil.bindPreviewButton(this._page, this._content, item, btnShowHidePreview);
	}

	_renderInner_initPreviewImportButton (item, btnImport) {
		btnImport.addEventListener("click", async evt => {
			evt.stopPropagation();
			evt.preventDefault();

			if (this._isRadio) this.close();

			const toImport = this._content[item.ix];
			try {
				await this._pDoPreCachePack();
				let imported;
				try {
					imported = await this.pImportEntry(toImport);
				} finally {
					this._pHandleClickRunButton_doDumpPackCache();
				}
				if (!imported) return; // If the import was cancelled
				UtilApplications.doShowImportedNotification(imported);
			} catch (e) {
				setTimeout(() => { throw e; });
				UtilApplications.doShowImportedNotification({entity: toImport, status: UtilApplications.TASK_EXIT_FAILED});
			}
		});
	}

	_renderInner_initDroppable (listItem) {
		listItem.ele.addEventListener("dragstart", evt => {
			const meta = {
				type: this.constructor.FOLDER_TYPE,
				subType: UtilEvents.EVT_DATA_SUBTYPE__IMPORT,
				page: this._page,
				source: listItem.values.source,
				hash: listItem.values.hash,
				name: listItem.name,
				tag: this._getAsTag(listItem),
			};
			evt.dataTransfer.setData("text/plain", JSON.stringify(meta));
		});
	}

	// Overwrite as required
	_renderInner_initRunButton () {
		this._$btnRun.click(() => this._pHandleClickRunButton());
	}

	_renderInner_initRunButtonsAdditional () { /* Implement as required */ }

	_renderInner_initSearchKeyHandlers () {
		if (!this._$iptSearch) return;

		this._renderInner_initSearchKeyHandlers_enter();
	}

	_renderInner_initSearchKeyHandlers_enter () {
		this._$iptSearch.keydown(async evt => {
			if (evt.key !== "Enter") return;
			if (!this._list) return;

			evt.stopPropagation();
			evt.preventDefault();

			const li = this._list.visibleItems[0];
			if (!li) return;

			await this._pImportListItems({
				listItems: [li],
				isBackground: true,
			});
		});
	}

	_renderInner_initRunButtonsAdditional_genericMods () {
		if (this._$btnsRunAdditional["btn-run-mods"]) this._$btnsRunAdditional["btn-run-mods"].click(() => this._pHandleClickRunButton({optsPostProcessing: {isUseMods: true}}));
	}

	async _pFnPostProcessEntries (entries) {
		return entries; // No-op; overwrite in subclasses
	}

	async _pHandleClickRunButton (
		{
			gameProp = null,
			sidebarTab = null,
			optsPostProcessing = {},
			optsImportEntry = {},
		} = {},
	) {
		if (!this._list) return;

		const listItems = this._list.items
			.filter(it => it.data.cbSel.checked);

		if (!listItems.length) return ui.notifications.warn(`Please select something to import!`);

		if (!this._pack && listItems.length > 100 && !Config.get("ui", "isDisableLargeImportWarning")) {
			const isContinue = await InputUiUtil.pGetUserBoolean({
				title: `Warning: Large Import`,
				htmlDescription: `You have selected ${listItems.length} ${listItems.length === 1 ? "entity" : "entities"} to import.<br>Importing a large number of entities may degrade game performance (consider importing to a compendium instead).<br>Do you wish to continue?`,
				textYesRemember: "Continue and Remember",
				textYes: "Continue",
				textNo: "Cancel",
				fnRemember: val => Config.set("ui", "isDisableLargeImportWarning", val),
			});
			if (isContinue == null || isContinue === false) return;
		}

		if (this._pack && !Config.get("ui", "isDisableLargeImportWarning") && (this._pack.index.size + listItems.length) > 500) {
			const isContinue = await InputUiUtil.pGetUserBoolean({
				title: `Warning: Large Compendium`,
				htmlDescription: `You have selected ${listItems.length} ${listItems.length === 1 ? "entity" : "entities"} to import${this._pack.index.size ? ` to a compendium with ${this._pack.index.size} existing document${this._pack.index.size !== 1 ? "s" : ""}` : ""}.<br>Importing a large number of documents to a single compendium may degrade game performance.<br>Do you wish to continue?`,
				textYesRemember: "Continue and Remember",
				textYes: "Continue",
				textNo: "Cancel",
				fnRemember: val => Config.set("ui", "isDisableLargeImportWarning", val),
			});
			if (isContinue == null || isContinue === false) return;
		}

		this.close();

		await this._pImportListItems({
			listItems,
			optsPostProcessing,
			optsImportEntry,
			gameProp,
			sidebarTab,
		});

		this._$cbAll.prop("checked", false);
		this._list.items.forEach(item => {
			item.data.cbSel.checked = false;
			item.ele.classList.remove("list-multi-selected");
		});
	}

	async _pImportListItems (
		{
			listItems,
			optsPostProcessing,
			optsImportEntry,
			gameProp,
			sidebarTab,

			isBackground = false,
		},
	) {
		gameProp = gameProp || this._gameProp;
		sidebarTab = sidebarTab || this._sidebarTab;

		let entries = listItems.map(li => this._content[li.ix]);
		entries = await this._pFnPostProcessEntries(entries, optsPostProcessing);
		if (entries == null) return;

		this.activateSidebarTab({sidebarTab});

		await this._pDoPreCachePack({gameProp});

		await (
			isBackground
				? this._pImportListItems_background({entries, optsImportEntry})
				: this._pImportListItems_foreground({entries, optsImportEntry})
		);

		if (!this._actor && !this._table && !this._pack) game[gameProp].render();

		this._pHandleClickRunButton_doDumpPackCache();
	}

	async _pImportListItems_background ({entries, optsImportEntry}) {
		for (const entry of entries) {
			try {
				const importedMeta = await this.pImportEntry(entry, optsImportEntry);
				UtilApplications.doShowImportedNotification(importedMeta);
			} catch (e) {
				UtilApplications.doShowImportedNotification({entity: entry, status: UtilApplications.TASK_EXIT_FAILED});
				console.error(e);
			}
		}
	}

	async _pImportListItems_foreground ({entries, optsImportEntry}) {
		const tasks = entries.map(entry => {
			return new Util.Task(
				`${entry._displayName || entry.name} (${Parser.sourceJsonToAbv(SourceUtil.getEntitySource(entry))})`,
				() => this.pImportEntry(entry, optsImportEntry),
			);
		});
		await UtilApplications.pRunTasks(tasks);
	}

	// Overwrite as required
	async _renderInner_pInitFilteredList () {
		// Init list library
		this._list = new List({
			$iptSearch: this._$iptSearch,
			$wrpList: this._$wrpList,
			fnSort: this._fnListSort,
			sortByInitial: this._listInitialSortBy,
		});
		SortUtil.initBtnSortHandlers(this._$wrpBtnsSort, this._list);

		await this._pageFilter.pInitFilterBox({
			$iptSearch: this._$iptSearch,
			$btnReset: this._$btnReset,
			$btnOpen: this._$bntFilter,
			$btnToggleSummaryHidden: this._$btnToggleSummary,
			$wrpMiniPills: this._$wrpMiniPills,
			namespace: this._getFilterNamespace(),
		});

		this._content.forEach(it => this._pageFilter.addToFilters(it));

		this._renderInner_absorbListItems();
		this._list.init();

		this._pageFilter.trimState();
		this._pageFilter.filterBox.render();

		await this._pPostFilterRender();

		this._pageFilter.filterBox.on(
			FilterBox.EVNT_VALCHANGE,
			this._handleFilterChange.bind(this),
		);

		this._handleFilterChange();
	}

	/** Implement as required. */
	async _pPostFilterRender () {}

	async _pPostRenderOrShow () {
		await super._pPostRenderOrShow();
		if (this._$iptSearch) this._$iptSearch.focus();
	}

	_renderInner_initList () {
		// Init list library
		this._list = new List({
			$iptSearch: this._$iptSearch,
			$wrpList: this._$wrpList,
			fnSort: this._fnListSort,
		});
		SortUtil.initBtnSortHandlers(this._$wrpBtnsSort, this._list);

		this._renderInner_absorbListItems();
		this._list.init();
	}

	// Overwrite as required
	_renderInner_absorbListItems () {
		this._list.doAbsorbItems(
			this._content,
			{
				fnGetName: it => it.name,
				fnGetValues: it => ({
					source: it.source,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	_handleFilterChange () {
		const f = this._pageFilter.filterBox.getValues();
		this._list.filter(li => this._pageFilter.toDisplay(f, this._content[li.ix]));
	}

	async pImportEntry (...args) {
		// N.b. this method should *not* contain any functionality beyond importing and calling the hook.
		const importSummary = await this._pImportEntry(...args);
		UtilHooks.callAll(UtilHooks.HK_IMPORT_COMPLETE, importSummary);
		return importSummary;
	}

	async _pImportEntry () { throw new Error(`Unimplemented!`); }

	async pGetSources ({isApplyWorldDataSourceFilter = true} = {}) {
		return (await this._pGetSources())
			.filter(dataSource => !isApplyWorldDataSourceFilter || !UtilWorldDataSourceSelector.isFiltered(dataSource));
	}

	async _pGetSources () { throw new Error(`Unimplemented!`); }

	async pGetAllContent ({sources, uploadedFiles, customUrls, isBackground = false}) {
		const userData = await this.pGetChooseImporterUserDataForSources(sources);
		const cacheKeys = [];

		return UtilDataSource.pGetAllContent({
			sources,
			uploadedFiles,
			customUrls,
			isBackground,
			userData,
			cacheKeys,

			page: this._page,

			isDedupable: this._isDedupable,
			fnGetDedupedData: this._getDedupedData ? this._getDedupedData.bind(this) : null,

			fnGetBlocklistFilteredData: this._getBlocklistFilteredData ? this._getBlocklistFilteredData.bind(this) : null,
		});
	}

	async _pImportEntry_getUserVersion (entity) {
		if (entity._foundryIsIgnoreVersions) return entity;

		const versions = DataUtil.proxy.getVersions(entity.__prop, entity);
		if (!versions.length) return entity;

		const ix = await InputUiUtil.pGetUserEnum({
			values: versions,
			placeholder: "Select Version...",
			title: `Select the Version to Import`,
			fnDisplay: it => {
				if (it == null) return `(Base version)`;
				return `${it.name}${entity.source !== it.source ? ` (${Parser.sourceJsonToAbv(it.source)})` : ""}`;
			},
			isAllowNull: true,
		});

		if (ix == null) {
			const cpy = MiscUtil.copy(entity);
			cpy._foundryIsIgnoreVersions = true;
			return cpy;
		}
		return versions[ix];
	}

	async _pGetSourcesHomebrew (nxtOpts = {}) {
		return [
			...(await Vetools.pGetLocalHomebrewSources(...this._dirsHomebrew)).map(({name, url, abbreviations}) => new UtilDataSource.DataSourceUrl(
				name,
				url,
				{
					...nxtOpts,
					filterTypes: [UtilDataSource.SOURCE_TYP_BREW, UtilDataSource.SOURCE_TYP_BREW_LOCAL],
					abbreviations,
				},
			)),
			...(await Vetools.pGetHomebrewSources(...this._dirsHomebrew)).map(({name, url, abbreviations}) => new UtilDataSource.DataSourceUrl(
				name,
				url,
				{
					...nxtOpts,
					filterTypes: [UtilDataSource.SOURCE_TYP_BREW],
					abbreviations,
				},
			)),
		];
	}

	getFolderPathMeta () {
		return {
			alpha: {
				label: "First Letter of Name",
				getter: it => it.name.slice(0, 1).toUpperCase(),
			},
			source: {
				label: "Source (Full)",
				getter: it => Parser.sourceJsonToFull(it.source),
			},
			sourceAbbreviation: {
				label: "Source (Abbreviation)",
				getter: it => Parser.sourceJsonToAbv(it.source),
			},
		};
	}

	/**
	 * @param entry
	 * @param [opts]
	 * @param [opts.sorting] Folder sorting type, either `"a"` (alphabetical) or `"m"` (manual). Defaults to alphabetical.
	 */
	async _pImportEntry_pGetFolderId (entry, opts) {
		opts = opts || {};
		return this._pGetCreateFoldersGetIdFromObject({folderType: this.constructor.FOLDER_TYPE, obj: entry, sorting: opts.sorting});
	}

	async _pImportEntry_pCreateTempDirectoryGetId () {
		// FIXME(Future) Non-GM users cannot ever create folders, so this is a no-op
		if (!Util.Fvtt.canUserCreateFolders()) return null;
		return UtilFolders.pCreateFoldersGetId({
			folderType: this.constructor.FOLDER_TYPE,
			folderNames: [Config.get("import", "tempFolderName")],
		});
	}

	_getFilterNamespace () { return `importer_${this._actor ? `actor` : `directory`}_${this._namespace || this._props.join("_")}`; }

	/**
	 * @param opts
	 * @param [opts.name]
	 * @param [opts.source]
	 * @param [opts.entity]
	 * @param [opts.flags] N.b.: only implemented for journal entries/tables. // TODO(Future) Implement for actors/items as required.
	 * @param [opts.gameProp] Game prop override
	 * @param [opts.importOpts]
	 * @param [opts.importOpts.isTemp]
	 * @param [opts.importOpts.isImportToTempDirectory]
	 */
	_getDuplicateMeta (opts) {
		opts = opts || {};

		const existing = this._getDuplicateMeta_getExisting(opts);

		const mode = Config.get("import", "deduplicationMode");
		return {
			mode,
			existing: existing,
			// Helper values
			isSkip: mode === ConfigConsts.C_IMPORT_DEDUPE_MODE_SKIP && existing != null,
			isOverwrite: mode === ConfigConsts.C_IMPORT_DEDUPE_MODE_OVERWRITE && existing != null,
		};
	}

	_getDuplicateMeta_getExisting (opts) {
		if (opts?.importOpts?.isTemp || opts?.importOpts?.isImportToTempDirectory) return null;

		const gameProp = opts.gameProp || this._gameProp;

		// Only check the pack if we're using an entity type the pack can store
		const pack = gameProp === this._gameProp ? this._pack : null;

		let existing = null;
		switch (gameProp) {
			// region Entities with sources in Foundry
			case "actors":
			case "items": {
				if (!((opts.name != null && opts.source != null) || opts.entity)) throw new Error(`Either "name" and "source", or "entity", must be provided!`);

				const cleanName = (opts.name ?? UtilDataConverter.getNameWithSourcePart(opts.entity)).toLowerCase().trim();
				const cleanSource = (opts.source ?? UtilDataConverter.getSourceWithPagePart(opts.entity)).toLowerCase().trim();

				switch (gameProp) {
					case "actors": {
						if (pack) {
							const key = this._getDuplicateMeta_getEntityKey({name: cleanName, source: cleanSource});
							existing = (this._packCache || {})[key];
						} else {
							existing = game[gameProp].find(it => this.constructor._getDuplicateMeta_getCleanName(it) === cleanName && (!Config.get("import", "isStrictMatching") || (MiscUtil.get(it, "data", "data", "details", "source") || "").toLowerCase().trim() === cleanSource));
						}
						break;
					}
					case "items": {
						if (pack) {
							const key = this._getDuplicateMeta_getEntityKey({name: cleanName, source: cleanSource});
							existing = (this._packCache || {})[key];
						} else {
							existing = game[gameProp].find(it => this.constructor._getDuplicateMeta_getCleanName(it) === cleanName && (!Config.get("import", "isStrictMatching") || (MiscUtil.get(it, "data", "data", "source") || "").toLowerCase().trim() === cleanSource));
						}
						break;
					}
				}

				break;
			}
			// endregion

			// region Entities without sources in Foundry
			case "journal":
			case "tables":
			case "scenes": {
				const cleanName = opts.name.toLowerCase().trim();

				if (pack) {
					existing = (this._packCacheFlat || []).find(it => this.constructor._getDuplicateMeta_getCleanName(it) === cleanName && this.constructor._getDuplicateMeta_isFlagMatch(opts.flags, it));
				} else {
					existing = game[gameProp].find(it => this.constructor._getDuplicateMeta_getCleanName(it) === cleanName && this.constructor._getDuplicateMeta_isFlagMatch(opts.flags, it));
				}
				break;
			}
			// endregion

			default: throw new Error(`Game property "${gameProp}" is not supported!`);
		}
		return existing;
	}

	static _getDuplicateMeta_getCleanName (it) {
		let out = (MiscUtil.get(it, "data", "name") || "").toLowerCase().trim();

		out = out
			.replace(/\[[^\]]+]/g, "") // Remove tags
			.trim();

		return out;
	}

	static _getDuplicateMeta_isFlagMatch (flags, entity) {
		if (!flags) return true;
		if (!entity) return false;

		if (!entity.data.flags) return false;
		for (const [moduleKey, flagGroup] of Object.entries(flags)) {
			if (entity.data.flags[moduleKey] == null) return false;
			for (const [k, v] of Object.entries(flagGroup)) {
				if (!CollectionUtil.deepEquals(v, entity.data.flags[moduleKey]?.[k])) return false;
			}
		}
		return true;
	}

	_getDuplicateMeta_getEntityKey (obj) {
		return Object.entries(obj)
			.sort(([aK], [bK]) => SortUtil.ascSortLower(aK, bK))
			.map(([k, v]) => `${k}=${`${v}`.trim()}`.toLowerCase())
			.join("::");
	}

	async _pDoPreCachePack ({gameProp = null} = {}) {
		gameProp = gameProp || this._gameProp;

		if (!this._pack || Config.get("import", "deduplicationMode") === ConfigConsts.C_IMPORT_DEDUPE_MODE_NONE) return;

		this._packCache = {};
		this._packCacheFlat = [];
		const content = await UtilCompendium.pGetCompendiumData(this._pack, true);

		content.forEach(ent => {
			switch (gameProp) {
				case "actors": {
					const cleanName = (MiscUtil.get(ent, "data", "name") || "").toLowerCase().trim();
					const cleanSource = (MiscUtil.get(ent, "data", "data", "details", "source") || "").toLowerCase().trim();

					const key = this._getDuplicateMeta_getEntityKey({name: cleanName, source: cleanSource});
					this._packCache[key] = ent;

					break;
				}
				case "items": {
					const cleanName = (MiscUtil.get(ent, "data", "name") || "").toLowerCase().trim();
					const cleanSource = (MiscUtil.get(ent, "data", "data", "source") || "").toLowerCase().trim();

					const key = this._getDuplicateMeta_getEntityKey({name: cleanName, source: cleanSource});
					this._packCache[key] = ent;

					break;
				}
				case "journal":
				case "tables":
				case "scenes": {
					const cleanName = (MiscUtil.get(ent, "data", "name") || "").toLowerCase().trim();

					const key = this._getDuplicateMeta_getEntityKey({name: cleanName});
					this._packCache[key] = ent;

					break;
				}
				default: throw new Error(`Game property "${gameProp}" is not supported!`);
			}

			this._packCacheFlat.push(ent);
		});
	}

	_pHandleClickRunButton_doDumpPackCache () {
		this._packCache = null;
		this._packCacheFlat = null;
	}

	async _pImportEntry_pDoUpdateExistingPackEntity (duplicateMeta, itemData) {
		if (duplicateMeta.existing.effects?.length) await duplicateMeta.existing.deleteEmbeddedDocuments("ActiveEffect", duplicateMeta.existing.effects.map(it => it.id));
		if (this._gameProp === "tables" && duplicateMeta.existing.results?.size) await duplicateMeta.existing.deleteEmbeddedDocuments("TableResult", duplicateMeta.existing.results.map(it => it.id));

		this._pImportEntry_pDoUpdateExisting_maintainImg({duplicateMeta, docData: itemData});

		await UtilDocuments.pUpdateDocument(duplicateMeta.existing, itemData);

		await this._pImportEntry_pAddToTargetTableIfRequired([duplicateMeta.existing], duplicateMeta);

		return new ImportSummary({
			status: UtilApplications.TASK_EXIT_COMPLETE_UPDATE_OVERWRITE,
			imported: [
				new ImportedDocument({
					isExisting: true,
					document: duplicateMeta.existing,
					pack: this._pack,
				}),
			],
		});
	}

	async _pImportEntry_pDoUpdateExistingDirectoryEntity (duplicateMeta, itemData) {
		if (this._gameProp === "tables" && duplicateMeta.existing.results?.size) await duplicateMeta.existing.deleteEmbeddedDocuments("TableResult", duplicateMeta.existing.results.map(it => it.id));

		this._pImportEntry_pDoUpdateExisting_maintainImg({duplicateMeta, docData: itemData});

		await UtilDocuments.pUpdateDocument(duplicateMeta.existing, itemData);

		return new ImportSummary({
			status: UtilApplications.TASK_EXIT_COMPLETE_UPDATE_OVERWRITE,
			imported: [
				new ImportedDocument({
					isExisting: true,
					document: duplicateMeta.existing,
				}),
			],
		});
	}

	_pImportEntry_pDoUpdateExisting_maintainImg ({duplicateMeta, docData}) {
		if (!duplicateMeta?.isOverwrite) return;

		const prevImg = Config.get("import", "isDuplicateHandlingMaintainImage") ? duplicateMeta.existing.img : null;
		if (prevImg != null) docData.img = prevImg;
	}

	async _pImportEntry_pImportToDirectoryGeneric (toImport, importOpts, dataOpts = {}, {docData = null, isSkipDuplicateHandling = false} = {}) {
		docData = docData || await this._pImportEntry_pImportToDirectoryGeneric_pGetImportableData(
			toImport,
			{
				isAddDataFlags: true, // This is implicit for some data types, but explicit for others.
				filterValues: importOpts.filterValues,
				...dataOpts,
				isAddPermission: true,
				defaultPermission: importOpts.defaultPermission,
			},
			importOpts,
		);

		// TODO(v10) refactor this into e.g. classes implementing methods for the non-shared components
		const duplicateMeta = isSkipDuplicateHandling
			? null
			: this._getDuplicateMeta({name: docData.name, source: MiscUtil.get(docData, "data", "source"), importOpts});
		if (duplicateMeta?.isSkip) {
			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_SKIPPED_DUPLICATE,
				imported: [
					new ImportedDocument({
						isExisting: true,
						document: duplicateMeta.existing,
					}),
				],
			});
		}

		const Clazz = this._getDocumentClass();

		if (importOpts.isTemp) {
			const imported = await Clazz.create(docData, {renderSheet: true, temporary: true});
			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					new ImportedDocument({
						document: imported,
					}),
				],
			});
		}

		if (this._pack) {
			if (duplicateMeta?.isOverwrite) return this._pImportEntry_pDoUpdateExistingPackEntity(duplicateMeta, docData);

			const instance = new Clazz(docData);
			const imported = await this._pack.importDocument(instance);

			await this._pImportEntry_pAddToTargetTableIfRequired([imported], duplicateMeta);

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					new ImportedDocument({
						document: imported,
						pack: this._pack,
					}),
				],
			});
		}

		if (duplicateMeta?.isOverwrite) return this._pImportEntry_pDoUpdateExistingDirectoryEntity(duplicateMeta, docData);

		const folderId = importOpts.folderId !== undefined ? importOpts.folderId : await this._pImportEntry_pGetFolderId(toImport);
		if (folderId) docData.folder = folderId;

		const imported = await Clazz.create(docData, {renderSheet: false, temporary: false});

		await game[this._gameProp].set(imported.id, imported);

		return new ImportSummary({
			status: UtilApplications.TASK_EXIT_COMPLETE,
			imported: [
				new ImportedDocument({
					document: imported,
				}),
			],
		});
	}

	_getDocumentClass () {
		switch (this._gameProp) {
			case "items": return CONFIG.Item.documentClass;
			case "journal": return CONFIG.JournalEntry.documentClass;
			case "tables": return CONFIG.RollTable.documentClass;
			case "scenes": return CONFIG.Scene.documentClass;
		}
		throw new Error(`Unhandled game prop "${this._gameProp}"`);
	}

	async _pImportEntry_pAddToTargetTableIfRequired (fvttEntities, duplicateMeta) {
		if (!this._table) return;

		// Avoid duplicating rows if we're generally in "skip" mode
		const isFilterRows = duplicateMeta?.mode === ConfigConsts.C_IMPORT_DEDUPE_MODE_SKIP
			// Avoid duplicating rows if the linked entity was overwritten (the row shouldn't change in this case)
			|| duplicateMeta?.isOverwrite;

		fvttEntities = isFilterRows
			? fvttEntities.filter(fvttEntity => !this._table.results.some(it => it.data.resultId === fvttEntity.id))
			: fvttEntities;
		if (!fvttEntities.length) return;

		const rangeLowHigh = DataConverterTable.getMaxTableRange(this._table) + 1;
		await UtilDocuments.pCreateEmbeddedDocuments(
			this._table,
			await fvttEntities.pSerialAwaitMap(fvttEntity => DataConverterTable.pGetTableResult({
				type: CONST.TABLE_RESULT_TYPES.COMPENDIUM,
				text: fvttEntity.name,
				resultId: fvttEntity.id,
				collection: this._pack.collection,
				rangeExact: rangeLowHigh,
				img: fvttEntity.img,
			})),
			{
				propData: "results",
				ClsEmbed: TableResult,
			},
		);
	}

	/**
	 * @param it
	 * @param getItemOpts
	 * @return {*}
	 */
	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) { throw new Error(`Unimplemented!`); }

	/** Implement as required. */
	async pGetChooseImporterUserDataForSources () {}

	_getAsTag (listItem) {
		const tag = Parser.getPropTag(this._content[listItem.ix].__prop);
		const ptId = DataUtil.generic.packUid(this._content[listItem.ix], tag);
		return `@${tag}[${ptId}]`;
	}
}
ImportList._STO_K_FOLDER_PATH_SPEC = "ImportList.folderKeyPathSpec";
ImportList._suppressCreateSheetItemHookTimeStart = null;

// TODO refactor parts of this into the main ImportList class (allowing a resolution other than just importing) and use
//   this to handle the "quick import" in-list buttons
/**
 * @mixin
 */
function MixinUserChooseImporter (ClsImportList) {
	class MixedUserChooseImporter extends ClsImportList {
		constructor (externalData, applicationOptsOverride, subclassOptsOverride, chooseImporterOpts = {}) {
			super(externalData, applicationOptsOverride, subclassOptsOverride);
			this._isRadio = true;

			this._isResolveOnClose = true;
			this._fnResolve = null;
			this._fnReject = null;
			this.pResult = null;

			this._isForceImportToTempDirectory = !!chooseImporterOpts.isForceImportToTempDirectory;
		}

		_getImportOpts () {
			return this._isForceImportToTempDirectory
				? {isImportToTempDirectory: true}
				: {isTemp: true, isDataOnly: true};
		}

		_isImportSuccess (importSummary) {
			return (!this._isForceImportToTempDirectory && importSummary.status === UtilApplications.TASK_EXIT_COMPLETE_DATA_ONLY)
				|| (this._isForceImportToTempDirectory && importSummary.status === UtilApplications.TASK_EXIT_COMPLETE);
		}

		async _pHandleClickRunButton () {
			if (!this._list) return;

			try {
				const selItem = this._list.items
					.find(it => it.data.cbSel.checked);

				if (!selItem) return ui.notifications.warn(`Please select something from the list!`);

				this._isResolveOnClose = false;

				this.close();

				let entries = [this._content[selItem.ix]];

				entries = await this._pFnPostProcessEntries(entries);
				if (entries == null) return;

				const importOpts = this._getImportOpts();

				const importSummary = await this.pImportEntry(entries[0], importOpts);
				if (this._isImportSuccess(importSummary)) this._fnResolve(importSummary?.imported?.[0]?.document);
				else this._fnReject(new Error(`Import exited with status "${importSummary.status.toString()}"`));

				selItem.data.cbSel.checked = false;
				selItem.ele.classList.remove("list-multi-selected");
			} catch (e) {
				this._fnReject(e);
			}
		}

		_renderInner_initPreviewImportButton (item, btnImport) {
			btnImport.addEventListener("click", async evt => {
				evt.stopPropagation();
				evt.preventDefault();

				try {
					let entries = [this._content[item.ix]];

					entries = await this._pFnPostProcessEntries(entries);
					if (entries == null) return;

					const importOpts = this._getImportOpts();

					const imported = await this.pImportEntry(entries[0], importOpts);
					if (this._isImportSuccess(imported)) this._fnResolve(imported?.imported?.[0]?.document);
					else this._fnReject(new Error(`Import exited with status "${imported.status.toString()}"`));

					this.close();
				} catch (e) {
					this._fnReject(e);
				}
			});
		}

		async close (...args) {
			await super.close(...args);
			if (this._isResolveOnClose) this._fnResolve(null);
		}

		async pPreRender (...preRenderArgs) {
			await super.pPreRender(...preRenderArgs);

			if (!preRenderArgs?.length) return;

			const [{fnResolve, fnReject, pResult}] = preRenderArgs;

			this._isResolveOnClose = true;
			this._fnResolve = fnResolve;
			this._fnReject = fnReject;
			this.pResult = pResult;
		}

		/**
		 * @param mode A predefined mode that the ChooseImporter wizard should use, rather than allowing the user to pick one.
		 * @param namespace A namespace for the ChooseImporter wizard. Useful for non-standard flows.
		 */
		static async pGetUserChoice (mode, namespace) {
			const {ChooseImporter} = await import("./ChooseImporter.js");

			const importer = new this({});
			await importer.pInit();

			let fnResolve = null;
			let fnReject = null;
			const pResult = new Promise((resolve, reject) => {
				fnResolve = resolve;
				fnReject = reject;
			});

			// Avoid passing in the actor, as we'll pull out the imported result and apply it to the actor ourselves
			const chooseImporter = new ChooseImporter(
				{
					mode: new ChooseImporter.Mode({
						...mode,
						importerInstance: importer,
					}),
					namespace,
					isAlwaysCloseWindow: true,
					isTemp: true,
					importerPreRenderArgs: {
						fnResolve,
						fnReject,
						pResult,
					},
				},
			);

			if (chooseImporter.isMaybeSkippable()) {
				if (await chooseImporter.pInitIsSubSkippable()) {
					chooseImporter.pDoQuickOpenUsingExistingSourceSelection({isSilent: true, isBackground: true}).then(null);
					return pResult;
				}
			}

			chooseImporter.render(true);
			return pResult;
		}
	}
	return MixedUserChooseImporter;
}

class ImportSummary {
	/**
	 * @param {ImportedDocument[]} [imported] List of ImportedDocument
	 * @param status The overall exit status of the import
	 */
	constructor (
		{
			imported,
			status,
		},
	) {
		this.imported = imported;
		this.status = status;
	}

	static cancelled () { return new this({status: UtilApplications.TASK_EXIT_CANCELLED}); }
	static completedStub () { return new this({imported: [], status: UtilApplications.TASK_EXIT_COMPLETE}); }
}

class ImportedDocument {
	/**
	 * @param name A display name for this import, which is used in notifications (if present).
	 * @param isExisting If the document/embeddedDocument was an existing one (either skipped or updated)
	 * @param document The document.
	 * @param actor The actor this document was imported to, if this document was imported to an actor.
	 * @param embeddedDocument The embedded document, if this was document was imported to an actor.
	 * @param pack The pack this document was imported to, if this document was imported to a pack.
	 */
	constructor (
		{
			name = null,
			isExisting = false,
			document = null,
			actor = null,
			embeddedDocument = null,
			pack = null,
		},
	) {
		if (document && embeddedDocument) throw new Error(`Only one of "document" and "embeddedDocument" may be specified!`);
		if (actor && pack) throw new Error(`Only one of "actor" and "pack" may be specified!`);

		this.name = name;
		this.isExisting = isExisting;
		this.document = document;
		this.actor = actor;
		this.embeddedDocument = embeddedDocument;
		this.pack = pack;
	}
}

class ImportCustomizer extends Application {
	constructor (dataList, resolve, {title, template, titleSearch, isActor}) {
		super({
			title,
			template,
			width: 960,
			height: Util.getMaxWindowHeight(),
			resizable: true,
		});

		this._dataList = dataList;
		this._resolve = resolve;

		this._titleSearch = titleSearch;
		this._isActor = isActor;

		this._list = null;
		this._$btnReset = null;
	}

	getData () {
		return {
			titleSearch: this._titleSearch,
			isActor: this._isActor,
		};
	}

	activateListeners ($html) {
		super.activateListeners($html);

		this._activateListeners_initList({$html});

		const $wrpBtnsSort = $html.find(`[data-name="wrp-btns-sort"]`);
		SortUtil.initBtnSortHandlers($wrpBtnsSort, this._list);

		this._activateListeners_bindControls({$html, $wrpBtnsSort});

		// Reset list to initial state
		if (this._$btnReset) this._$btnReset.click();
	}

	_activateListeners_initList ({$html}) { throw new Error(`Unimplemented`); }
	_activateListeners_bindControls ({$html, $wrpBtnsSort}) { throw new Error(`Unimplemented`); }

	async close () {
		this._resolve(null);
		return super.close();
	}
}

export {ImportList, MixinUserChooseImporter, ImportSummary, ImportedDocument, ImportCustomizer};
