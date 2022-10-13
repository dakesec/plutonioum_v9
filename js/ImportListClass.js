import {Vetools} from "./Vetools.js";
import {LGT, Util} from "./Util.js";
import {DataConverter} from "./DataConverter.js";
import {DataConverterSpell} from "./DataConverterSpell.js";
import {DataConverterClass} from "./DataConverterClass.js";
import {DataConverterClassSubclassFeature} from "./DataConverterClassSubclassFeature.js";
import {UtilActors} from "./UtilActors.js";
import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {ImportListFeat} from "./ImportListFeat.js";
import {ImportListCharacter} from "./ImportListCharacter.js";
import {
	Charactermancer_Class_HpIncreaseModeSelect,
	Charactermancer_Class_LevelSelect,
	Charactermancer_Class_ProficiencyImportModeSelect,
	Charactermancer_Class_StartingProficiencies,
	Charactermancer_Class_Util,
	PageFilterClassesFoundry,
} from "./UtilCharactermancerClass.js";
import {Charactermancer_StartingEquipment} from "./UtilCharactermancerEquipment.js";
import {Charactermancer_AdditionalSpellsSelect} from "./UtilCharactermancerAdditionalSpells.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {Charactermancer_Util} from "./UtilCharactermancer.js";
import {UtilGameSettings} from "./UtilGameSettings.js";
import {
	Charactermancer_Spell,
	Charactermancer_Spell_Modal,
} from "./UtilCharactermancerSpell.js";
import {ImportedDocument, ImportSummary} from "./ImportList.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilDocuments} from "./UtilDocuments.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {Charactermancer_Spell_Util} from "./UtilCharactermancerSpellSlotLevelSelect.js";
import {AppSourceSelectorMulti} from "./AppSourceSelectorMulti.js";
import {ModalFilterClassesFvtt} from "./UtilModalFilter.js";
import {UtilAdvancements} from "./UtilAdvancements.js";
import {GameStorage} from "./GameStorage.js";

class ImportListClass extends ImportListCharacter {
	static get ID () { return "classes-subclasses"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Classes & Subclasses"; }

	static _ = this.registerImpl(this);

	// region External
	static init () {
		const dropOpts = {
			isForce: true,
			fnGetSuccessMessage: ({ent}) => `Imported "${ent.className || ent.name}"${ent.subclassShortName ? ` (${ent.name})` : ""} via Class Importer`,
			fnGetFailedMessage: ({ent}) => `Failed to import "${ent.className || ent.name}"${ent.subclassShortName ? ` (${ent.name})` : ""}! ${VeCt.STR_SEE_CONSOLE}`,
		};
		this._initCreateSheetItemHook({
			...dropOpts,
			prop: "class",
			importerName: "Class",
		});
		this._initCreateSheetItemHook({
			...dropOpts,
			prop: "subclass",
			importerName: "Subclass",
		});

		// region Temporarily disable advancements when dropping a Plutonium-imported class/subclass to sheet
		Hooks.on("dropActorSheetData", (actor, actorSheet, data) => {
			if (!Config.get("importClass", "isSuppressAdvancementsOnImportedDrop")) return;
			if (data?.type !== "Item") return;

			const item = game.items.get(data.id);
			if (!item) return;

			const propDroppable = item.getFlag(SharedConsts.MODULE_NAME_FAKE, "propDroppable");
			if (!["class", "subclass"].includes(propDroppable)) return;

			const isDisabled = game.settings.get("dnd5e", "disableAdvancements");
			if (isDisabled) return;

			GameStorage.setOverride("dnd5e", "disableAdvancements", true);
			setTimeout(() => {
				GameStorage.unsetOverride("dnd5e", "disableAdvancements");
			}, 200);
		});
		// endregion

		ImportListClass.SheetLevelUpButtonAdapter.init();
	}
	// endregion

	constructor (externalData) {
		externalData = externalData || {};
		super(
			{
				title: "Import Classes",
				template: `${SharedConsts.MODULE_LOCATION}/template/ImportListClass.hbs`,
				height: Util.getMaxWindowHeight(),
				resizable: true,
			},
			externalData,
			{
				namespace: "class_subclass",
				dirsHomebrew: ["class", "subclass"],
				defaultFolderPath: ["Classes"],
				sidebarTab: "items",
				gameProp: "items",
				pageFilter: new PageFilterClassesFoundry(),
				isDedupable: true,
				configGroup: "importClass",
				page: UrlUtil.PG_CLASSES,
			},
		);

		this._cachedData = null;
	}

	async pSetContent (val) {
		await super.pSetContent(val);
		this._cachedData = null;
	}

	static async pPostLoad (data, {actor} = {}) {
		const isIgnoredLookup = await DataConverterClassSubclassFeature.pGetClassSubclassFeatureIgnoredLookup({data});
		const out = await PageFilterClassesFoundry.pPostLoad(data, {actor, isIgnoredLookup});
		Charactermancer_Class_Util.addFauxOptionalFeatureFeatures(
			out.class,
			(await this._pPostLoad_pGetAllOptionalFeatures()).optionalfeature,
		);
		return out;
	}

	async _pGetSources () {
		return [
			new UtilDataSource.DataSourceSpecial(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.pGetClasses,
				{
					cacheKey: "5etools-classes",
					pPostLoad: (data) => this.constructor.pPostLoad(data, {actor: this._actor}),
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_ALL],
					isDefault: true,
				},
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					pPostLoad: (data) => this.constructor.pPostLoad(data, {actor: this._actor}),
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					pPostLoad: (data) => this.constructor.pPostLoad(data, {actor: this._actor}),
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			...(await this._pGetSourcesHomebrew({pPostLoad: (data) => this.constructor.pPostLoad(data, {actor: this._actor})})),
		];
	}

	isInvalidatedByConfigChange (configDiff) {
		const isHideSubclassRows = !!Config.get("importClass", "isHideSubclassRows");

		return this._cachedData && !!this._cachedData.isHideSubclassRows !== isHideSubclassRows;
	}

	getData () {
		// On switching between actor/not actor importer, dump the cache
		if (this._cachedData && (this._cachedData.isRadio !== !!this._actor)) this._cachedData = null;

		// On switching between hide/show subclasses, dump the cache
		const isHideSubclassRows = !!Config.get("importClass", "isHideSubclassRows");
		if (this._cachedData && (!!this._cachedData.isHideSubclassRows !== !!isHideSubclassRows)) this._cachedData = null;

		this._cachedData = this._cachedData || {
			titleButtonRun: this._titleButtonRun,
			titleSearch: this._titleSearch,
			rows: this._content.class
				.sort((a, b) => SortUtil.ascSortLower(a.name, b.name) || SortUtil.ascSortLower(Parser.sourceJsonToFull(a.source || SRC_PHB), Parser.sourceJsonToFull(b.source || SRC_PHB)))
				.map((cls, ixClass) => {
					this._pageFilter.constructor.mutateForFilters(cls);

					return {
						name: cls.name,
						source: cls.source,
						sourceShort: Parser.sourceJsonToAbv(cls.source),
						sourceLong: Parser.sourceJsonToFull(cls.source),
						sourceClassName: Parser.sourceJsonToColor(cls.source),
						sourceStyle: BrewUtil2.sourceJsonToStylePart(cls.source),
						ixClass,
						disabled: !cls.classFeatures,
						subRows: isHideSubclassRows
							? []
							: (cls.subclasses || [])
								.map((sc, ixSubclass) => ({
									name: sc.name,
									source: sc.source || cls.source,
									sourceShort: Parser.sourceJsonToAbv(sc.source || cls.source),
									sourceLong: Parser.sourceJsonToFull(sc.source || cls.source),
									sourceClassName: Parser.sourceJsonToColor(sc.source || cls.source),
									sourceStyle: BrewUtil2.sourceJsonToStylePart(sc.source || cls.source),
									ixSubclass,
								})),
					};
				}),
		};

		if (this._actor) this._cachedData.isRadio = true;
		if (isHideSubclassRows) this._cachedData.isHideSubclassRows = true;

		return this._cachedData;
	}

	_getDedupedData ({allContentMerged}) {
		return ImportListClass.Utils.getDedupedData({allContentMerged});
	}

	_getBlocklistFilteredData ({dedupedAllContentMerged}) {
		return ImportListClass.Utils.getBlocklistFilteredData({dedupedAllContentMerged});
	}

	_renderInner_initRunButton () {
		this._$btnRun.click(async () => {
			if (!this._list) return;

			const listItems = this._actor
				? this._list.items
					.filter(it => it.data.tglSel && it.data.tglSel.classList.contains("active"))
				: this._list.items
					.filter(it => it.data.cbSel.checked);

			if (!listItems.length) return ui.notifications.warn(`Please select something to import!`);

			this.close();

			await this._pImportListItems({listItems});

			this._$cbAll.prop("checked", false).change();
		});
	}

	async _pImportListItems ({listItems, isBackground}) {
		this.activateSidebarTab();

		const selIds = listItems.map(it => ({ixClass: it.data.ixClass, ixSubclass: it.data.ixSubclass}));

		const mapped = selIds.map(({ixClass, ixSubclass}) => {
			// Make a copy of the classes, so we can modify it later
			const cls = MiscUtil.copy(this._content.class[ixClass]);
			return {ixClass, cls, ixSubclass, sc: ixSubclass != null ? cls.subclasses[ixSubclass] : null};
		});
		// Wipe the subclass array from any pure classes. Any subclasses we add to this array later, will be imported
		mapped.filter(it => !it.sc).forEach(it => it.cls.subclasses = []);
		// Sort so that the pure classes are first
		mapped.sort((a, b) => !!a.sc - !!b.sc);

		const classes = [];
		const looseSubclasses = [];
		mapped.forEach(it => {
			if (it.sc) {
				const cls = classes.find(cls =>
					cls.name.toLowerCase() === it.sc.className.toLowerCase()
					&& cls.source.toLowerCase() === it.sc.classSource.toLowerCase(),
				);

				if (cls) cls.subclasses.push(it.sc);
				else looseSubclasses.push({cls: it.cls, sc: it.sc});
			} else classes.push(it.cls);
		});

		if (classes.length || looseSubclasses.length) await this._pDoPreCachePack();

		await (
			isBackground
				? this._pImportListItems_background({classes, looseSubclasses})
				: this._pImportListItems_foreground({classes, looseSubclasses})
		);

		if (!this._actor) game[this._gameProp].render();
	}

	async _pImportListItems_background ({classes, looseSubclasses}) {
		for (const cls of classes) {
			try {
				const importedMeta = await this.pImportClass(cls);
				UtilApplications.doShowImportedNotification(importedMeta);
			} catch (e) {
				UtilApplications.doShowImportedNotification({entity: entry, status: UtilApplications.TASK_EXIT_FAILED});
				console.error(e);
			}
		}

		for (const {cls, sc} of looseSubclasses) {
			try {
				const importedMeta = await this.pImportSubclass(cls, sc);
				UtilApplications.doShowImportedNotification(importedMeta);
			} catch (e) {
				UtilApplications.doShowImportedNotification({entity: entry, status: UtilApplications.TASK_EXIT_FAILED});
				console.error(e);
			}
		}
	}

	async _pImportListItems_foreground ({classes, looseSubclasses}) {
		const tasks = [
			...classes.map(cls => {
				return new Util.Task(
					`${cls.name} (${Parser.sourceJsonToAbv(cls.source)})`,
					() => this.pImportClass(cls),
				);
			}),
			...looseSubclasses.map(({cls, sc}) => {
				return new Util.Task(
					`${sc.name} (${Parser.sourceJsonToAbv(sc.source)})`,
					() => this.pImportSubclass(cls, sc),
				);
			}),
		];
		await UtilApplications.pRunTasks(tasks);
	}

	async _renderInner_pInitFilteredList () {
		// Init list library
		this._list = new List({
			$iptSearch: this._$iptSearch,
			$wrpList: this._$wrpList,
			fnSort: (a, b, opts) => {
				if (opts.sortDir === "desc" && a.data.ixClass === b.data.ixClass && (a.data.ixSubclass != null || b.data.ixSubclass != null)) {
					return a.data.ixSubclass != null ? -1 : 1;
				}

				return SortUtil.ascSortLower(a.values.sortName, b.values.sortName);
			},
		});
		SortUtil.initBtnSortHandlers(this._$wrpBtnsSort, this._list);

		const flatListItems = this._cachedData.rows.map(r => {
			const fromClass = {...r};
			delete fromClass.subRows;

			if (Config.get("importClass", "isHideSubclassRows")) return [fromClass];

			const fromSubclass = r.subRows.map(sr => ({
				...sr,
				ixClass: r.ixClass,
				className: r.name,
				classSource: r.source,
				classSourceLong: r.sourceLong,
				classSourceClassName: r.sourceClassName,
			}));
			return [fromClass, ...fromSubclass];
		}).flat();

		await this._pageFilter.pInitFilterBox({
			$iptSearch: this._$iptSearch,
			$btnReset: this._$btnReset,
			$btnOpen: this._$bntFilter,
			$btnToggleSummaryHidden: this._$btnToggleSummary,
			$wrpMiniPills: this._$wrpMiniPills,
			namespace: this._getFilterNamespace(),
		});

		this._content.class.forEach(it => this._pageFilter.addToFilters(it));

		const optsListAbsorb = {
			fnGetName: it => it.name,
			// values used for sorting/search
			fnGetValues: it => {
				if (it.ixSubclass != null) {
					return {
						sortName: `${it.className} SOURCE ${it.classSourceLong} SUBCLASS ${it.name} SOURCE ${it.sourceLong}`,
						source: it.source,
						hash: UrlUtil.URL_TO_HASH_BUILDER["subclass"](it),
					};
				}

				return {
					sortName: `${it.name} SOURCE ${it.sourceLong}`,
					source: it.source,
					hash: UrlUtil.URL_TO_HASH_BUILDER[this._page](it),
				};
			},
			fnGetData: (li, it) => {
				const out = this._actor
					? {tglSel: li.ele.firstElementChild.firstElementChild}
					: UtilList2.absorbFnGetData(li);

				if (it.ixSubclass != null) {
					return {
						...out,
						ixClass: it.ixClass,
						ixSubclass: it.ixSubclass,
					};
				}

				return {
					...out,
					ixClass: it.ixClass,
				};
			},
		};

		if (this._actor) { // "Radio button" selection mode
			optsListAbsorb.fnBindListeners = listItem => {
				listItem.ele.addEventListener("click", () => {
					const isScItem = listItem.data.ixSubclass != null;
					const clsListItem = isScItem ? this._list.items.find(it => it.data.ixClass === listItem.data.ixClass && it.data.ixSubclass == null) : null;

					// region If clicking an item for the first time
					const actives = this._list.items.filter(it => it.data.tglSel.classList.contains("active"));
					if (!actives.length) {
						listItem.data.tglSel.classList.add("active");
						listItem.ele.classList.add("list-multi-selected");

						if (isScItem) {
							clsListItem.data.tglSel.classList.add("active");
							clsListItem.ele.classList.add("list-multi-selected");
						}

						return;
					}
					// endregion

					// region If re-clicking the currently selected item
					if (listItem.data.tglSel.classList.contains("active")) {
						listItem.data.tglSel.classList.remove("active");
						listItem.ele.classList.remove("list-multi-selected");

						if (isScItem) { // Deselect parent class item
							clsListItem.data.tglSel.classList.remove("active");
							clsListItem.ele.classList.remove("list-multi-selected");
						} else { // Deselect any subclass item
							actives.forEach(li => {
								li.data.tglSel.classList.remove("active");
								li.ele.classList.remove("list-multi-selected");
							});
						}

						return;
					}
					// endregion

					// region If clicking a different item to the one currently selected
					actives.forEach(li => {
						li.data.tglSel.classList.remove("active");
						li.ele.classList.remove("list-multi-selected");
					});

					listItem.data.tglSel.classList.add("active");
					listItem.ele.classList.add("list-multi-selected");

					if (isScItem) {
						clsListItem.data.tglSel.classList.add("active");
						clsListItem.ele.classList.add("list-multi-selected");
					}
					// endregion
				});
			};
		} else {
			optsListAbsorb.fnBindListeners = it => UtilList2.absorbFnBindListeners(this._list, it);
		}

		this._list.doAbsorbItems(flatListItems, optsListAbsorb);
		this._list.init();

		this._pageFilter.trimState();
		this._pageFilter.filterBox.render();

		this._pageFilter.filterBox.on(
			FilterBox.EVNT_VALCHANGE,
			this._handleFilterChange.bind(this),
		);

		this._handleFilterChange();
	}

	_renderInner_initFeelingLuckyButton () {
		if (!this._actor) return super._renderInner_initFeelingLuckyButton();

		this._$btnFeelingLucky.click(() => {
			if (!this._list || !this._list.visibleItems.length) return;

			const listItem = RollerUtil.rollOnArray(this._list.visibleItems);
			if (!listItem) return;

			listItem.ele.click();
			listItem.ele.scrollIntoView({block: "center"});
		});
	}

	_handleFilterChange () {
		return ModalFilterClasses.handleFilterChange({
			pageFilter: this._pageFilter,
			list: this._list,
			allData: this._content.class,
		});
	}

	/**
	 * Implement basic class importing for use by e.g. tag drag-and-drop.
	 *
	 * @param cls
	 * @param importOpts Options object.
	 * @param [importOpts.isTemp] if the item should be temporary, and displayed.
	 * @param [importOpts.filterValues] Saved filter values to be used instead of our own.
	 */
	async _pImportEntry (cls, importOpts) {
		importOpts = importOpts || {};

		// If we don't have any filter values, generate some defaults
		if (!importOpts.filterValues && !this._pageFilter?.filterBox) {
			importOpts.filterValues = await ImportListClass.pGetDefaultFilterValues();
		}

		// If we receive a render-able hover entry rather than the real class, dereference it
		if (cls?.data?.class) {
			const scRef = cls?.data?.subclass;

			cls = cls?.data?.class;
			cls = await Renderer.hover.pCacheAndGet("raw_class", cls.source, UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASSES](cls), {isCopy: true});

			const toLoad = {class: [cls]};

			if (scRef) {
				const sc = await Renderer.hover.pCacheAndGet("raw_subclass", scRef.source, UrlUtil.URL_TO_HASH_BUILDER["subclass"](scRef), {isCopy: true});
				toLoad.subclass = [sc];
			}

			const data = await this.constructor.pPostLoad(toLoad);
			cls = data.class[0];

			if (scRef) {
				const sc = cls.subclasses[0];
				cls.subclasses = [];
				return this.pImportSubclass(cls, sc, importOpts);
			}
		}

		return this.pImportClass(cls, importOpts);
	}

	/**
	 * @param cls
	 * @param [importOpts] Options object.
	 * @param [importOpts.isTemp] if the item should be temporary, and displayed.
	 * @param [importOpts.filterValues] Saved filter values to be used instead of our own.
	 * @param [importOpts.isCharactermancer] If the call is coming from the charactermancer.
	 * @param [importOpts.levels] Pre-defined list of levels to import.
	 */
	async pImportClass (cls, importOpts) {
		importOpts = importOpts || {};

		console.log(...LGT, `Importing class "${cls.name}" (from "${Parser.sourceJsonToAbv(cls.source)}")`);

		if (DataConverterClass.isStubClass(cls)) return ImportSummary.completedStub();

		if (importOpts.isTemp) return this._pImportClass_pImportToItems(cls, importOpts);
		if (this._actor) return this._pImportClass_pImportToActor(cls, importOpts);
		return this._pImportClass_pImportToItems(cls, importOpts);
	}

	/**
	 * @param cls A copy of the class data, which can be freely mutated.
	 * @param importOpts
	 */
	async _pImportClass_pImportToActor (cls, importOpts) {
		const dataBuilderOpts = new ImportListClass.ImportEntryOpts({
			isClassImport: true,
			isCharactermancer: importOpts.isCharactermancer,
		});

		// region Create one array of all class/subclass features
		let allFeatures;

		if (!cls._foundryAllFeatures) {
			allFeatures = Charactermancer_Class_Util.getAllFeatures(cls);

			this.constructor._tagFirstSubclassLoaded(cls, allFeatures);

			// Filter features by source
			allFeatures = Charactermancer_Util.getFilteredFeatures(allFeatures, this._pageFilter, importOpts.filterValues || this._pageFilter.filterBox.getValues());
		} else {
			this.constructor._tagFirstSubclassLoaded(cls);
		}
		// endregion

		const sc = cls.subclasses?.length ? cls.subclasses[0] : null;

		return this._pImportClassSubclass_pImportToActor({cls, sc, importOpts, dataBuilderOpts, allFeatures});
	}

	/**
	 * We want to avoid importing the first subclass feature, as this will be the intro/header to the subclass, which
	 * is imported as a separate subclass item. Therefore, tag it, so we don't treat it as a feature later.
	 * This may be inaccurate when importing homebrew, but that's the fault of the homebrew!
	 */
	static _tagFirstSubclassLoaded (cls, allFeatures = null) {
		let subclassLoadeds;
		if (allFeatures) {
			const group = allFeatures.find(it => it.subclassFeature);
			if (!group?.loadeds.length) return;
			subclassLoadeds = group.loadeds;
		} else {
			subclassLoadeds = cls._foundryAllFeatures.filter(it => it.type === "subclassFeature");
		}

		if (!subclassLoadeds.length) return;

		const expectedFirstSubclassFeatureLevel = cls.classFeatures.find(it => it.gainSubclassFeature)?.level;

		// Bail out if the levels don't line up, and fall back on importing the header entry as a feature,
		//   as there's probably something special going on.
		if (subclassLoadeds[0]?.entity?.level !== expectedFirstSubclassFeatureLevel) return;

		// Bail out if the feature is homebrew and has notable non-fluff data attached
		if (
			BrewUtil2.hasSourceJson(subclassLoadeds[0]?.entity?.source)
			&& [
				"skillProficiencies",
				"languageProficiencies",
				"toolProficiencies",
				"armorProficiencies",
				"weaponProficiencies",
				"savingThrowProficiencies",
				"immune",
				"resist",
				"vulnerable",
				"conditionImmune",
				"expertise",
			].some(prop => subclassLoadeds[0].entity[prop])
		) {
			return;
		}

		subclassLoadeds[0]._foundryIsIgnoreFeature = true;
	}

	async _pImportClassSubclass_pImportToActor ({cls, sc, importOpts, dataBuilderOpts, allFeatures}) {
		const selectedLevelIndices = await this._pGetSelectedLevelIndices(cls, importOpts, allFeatures, dataBuilderOpts, sc != null);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		await this._pValidateUserLevelIndices(selectedLevelIndices, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		dataBuilderOpts.targetLevel = Math.max(...selectedLevelIndices) + 1;
		dataBuilderOpts.numLevels = dataBuilderOpts.targetLevel - Math.min(...selectedLevelIndices);
		dataBuilderOpts.numLevelsPrev = UtilActors.getTotalClassLevels(this._actor);
		dataBuilderOpts.isIncludesLevelOne = cls != null // Always false for subclasses, as we never want to import level 1 proficiencies
			&& selectedLevelIndices.includes(0);
		dataBuilderOpts.proficiencyImportMode = await this._pImportClass_pGetProficiencyImportMode(cls, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();
		dataBuilderOpts.hpIncreaseMode = await this._pImportClass_pGetHpImportMode(cls, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		const actUpdate = {
			data: {},
		};

		const curLevelMetaAndExistingClassItem = await this._pImportEntry_pGetCurLevelFillClassData(actUpdate, cls, sc, importOpts, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();
		const {curLevel, existingClassItem, existingSubclassItem} = curLevelMetaAndExistingClassItem;

		this._pImportEntry_setActorFlags(actUpdate, cls, sc, curLevel, dataBuilderOpts);

		await this._pImportEntry_pDoUpdateCharacter(actUpdate, cls, sc, curLevel, existingClassItem, existingSubclassItem, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		await this._pImportCasterCantrips(cls, sc, curLevel, importOpts, dataBuilderOpts);

		await this._pImportEntry_pFillItemArrayAdditionalSpells(cls, cls.subclasses, curLevel, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		if (cls.preparedSpells && !cls.spellsKnownProgressionFixed) await this._pImportPreparedCasterSpells(cls, sc, curLevel, dataBuilderOpts);

		await this._pImportEntry_pAddUpdateClassItem(cls, sc, dataBuilderOpts);

		if (cls.preparedSpells) await this._pImportEntry_pFillPreparedSpells(cls, sc, curLevel, dataBuilderOpts);

		await this._pImportEntry_pHandleFeatures(cls, sc, allFeatures, selectedLevelIndices, importOpts, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		await this._pImportEntry_pAddUnarmedStrike();

		await this._pImportEntry_pAddAdvancements(dataBuilderOpts);

		await this._pImportEntry_pFinalise(dataBuilderOpts);

		if (this._actor.isToken) this._actor.sheet.render();

		return new ImportSummary({
			status: UtilApplications.TASK_EXIT_COMPLETE,
			imported: [
				new ImportedDocument({
					name: `${cls.name}${sc ? ` (${sc.name})` : ""}`,
					actor: this._actor,
				}),
			],
		});
	}

	async _pGetSelectedLevelIndices (cls, importOpts, allFeatures, dataBuilderOpts, isSubclass) {
		if (cls._foundrySelectedLevelIndices) return cls._foundrySelectedLevelIndices;

		// If there are pre-defined levels, map them to their relative index (which is always `level - 1`)
		if (importOpts.levels) return importOpts.levels.map(it => it - 1).filter(it => it >= 0);

		const indicesFormData = await Charactermancer_Class_LevelSelect.pGetUserInput({
			features: allFeatures,
			isSubclass,
			maxPreviousLevel: this._pImportEntry_getApproxPreviousMaxLevel(cls),
		});
		if (indicesFormData == null) return dataBuilderOpts.isCancelled = true;

		return indicesFormData.data;
	}

	/**
	 * Take a rough guess at what levels the character has already gained in this class(/subclass). We will use this to
	 * provide UI hints as to which levels the user shouldn't select when adding class levels.
	 */
	_pImportEntry_getApproxPreviousMaxLevel (cls) {
		const existingClassItems = this._getExistingClassItems(cls);
		if (!existingClassItems.length) return 0;
		return Math.max(...existingClassItems.map(it => it.data.data.levels || 0));
	}

	_pImportEntry_setActorFlags (actUpdate, cls, sc, curLevel, dataBuilderOpts) {
		const flags = {dnd5e: {}};

		// (Note that these are now instead handled, generally, by active effects)

		if (Object.keys(flags.dnd5e).length) actUpdate.flags = flags;
	}

	async _pImportClass_pGetProficiencyImportMode (cls, dataBuilderOpts) {
		const existingClassItems = this._actor.items.filter(it => it.type === "class");

		if (!dataBuilderOpts.isClassImport || !dataBuilderOpts.isIncludesLevelOne || !existingClassItems.length) return Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY;

		// If specified externally, use this
		if (cls._foundryStartingProficiencyMode != null) return cls._foundryStartingProficiencyMode;

		const out = await Charactermancer_Class_ProficiencyImportModeSelect.pGetUserInput();
		if (out == null) dataBuilderOpts.isCancelled = true;
		return out.data;
	}

	async _pImportClass_pGetHpImportMode (cls, dataBuilderOpts) {
		if (!Charactermancer_Class_HpIncreaseModeSelect.isHpAvailable(cls)) return Charactermancer_Class_HpIncreaseModeSelect.MODE_DO_NOT_INCREASE;

		// If specified externally, use this
		if (cls._foundryHpIncreaseMode != null) return cls._foundryHpIncreaseMode;

		const out = await Charactermancer_Class_HpIncreaseModeSelect.pGetUserInput();
		if (out == null) return dataBuilderOpts.isCancelled = true;
		if (out === VeCt.SYM_UI_SKIP) return Charactermancer_Class_HpIncreaseModeSelect.MODE_DO_NOT_INCREASE;
		return out.data;
	}

	async _pImportClass_pImportToItems (cls, importOpts) {
		const duplicateMeta = this._getDuplicateMeta({entity: cls, importOpts});
		if (duplicateMeta.isSkip) {
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

		const clsData = await DataConverterClass.pGetClassItem(
			cls,
			{
				isAddPermission: true,
				filterValues: importOpts.filterValues || this._pageFilter.filterBox.getValues(),
				pageFilter: this._pageFilter,
			},
		);

		const Clazz = this._getDocumentClass();

		if (importOpts.isTemp) {
			const clsItem = await Item.create(clsData, {renderSheet: true, temporary: true});
			const scItems = await (cls.subclasses || []).pSerialAwaitMap(sc => this._pImportSubclass_pImportToItems(cls, sc, importOpts));

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					clsItem,
					...scItems,
				].map(it => new ImportedDocument({document: it, actor: this._actor})),
			});
		} else if (this._pack) {
			if (duplicateMeta.isOverwrite) {
				const clsItem = await this._pImportEntry_pDoUpdateExistingPackEntity(duplicateMeta, clsData);
				const scItems = await (cls.subclasses || []).pSerialAwaitMap(sc => this._pImportSubclass_pImportToItems(cls, sc, importOpts));

				return new ImportSummary({
					status: UtilApplications.TASK_EXIT_COMPLETE_UPDATE_OVERWRITE,
					imported: [
						clsItem,
						...scItems,
					].map(it => new ImportedDocument({isExisting: true, document: it, actor: this._actor})),
				});
			}

			const clsItem = new Clazz(clsData);
			await this._pack.importDocument(clsItem);
			const scItems = await (cls.subclasses || []).pSerialAwaitMap(sc => this._pImportSubclass_pImportToItems(cls, sc, importOpts));

			await this._pImportEntry_pAddToTargetTableIfRequired([clsItem], duplicateMeta);

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					clsItem,
					...scItems,
				].map(it => new ImportedDocument({document: it, actor: this._actor})),
			});
		} else {
			if (duplicateMeta.isOverwrite) {
				const clsItem = await this._pImportEntry_pDoUpdateExistingDirectoryEntity(duplicateMeta, clsData);
				const scItems = await (cls.subclasses || []).pSerialAwaitMap(sc => this._pImportSubclass_pImportToItems(cls, sc, importOpts));

				return new ImportSummary({
					status: UtilApplications.TASK_EXIT_COMPLETE_UPDATE_OVERWRITE,
					imported: [
						clsItem,
						...scItems,
					].map(it => new ImportedDocument({isExisting: true, document: it, actor: this._actor})),
				});
			}

			const folderId = await this._pImportEntry_pGetFolderId(cls);
			if (folderId) clsData.folder = folderId;

			const clsItem = await Item.create(clsData, {renderSheet: false, temporary: false});

			await game.items.set(clsItem.id, clsItem);

			const scItems = await (cls.subclasses || []).pSerialAwaitMap(sc => this._pImportSubclass_pImportToItems(cls, sc, importOpts, {folderId}));

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					clsItem,
					...scItems,
				].map(it => new ImportedDocument({document: it, actor: this._actor})),
			});
		}
	}

	/**
	 * @param cls
	 * @param sc
	 * @param [importOpts] Options object.
	 * @param [importOpts.isTemp] if the item should be temporary, and displayed.
	 * @param [importOpts.filterValues] Saved filter values to be used instead of our own.
	 */
	async pImportSubclass (cls, sc, importOpts) {
		importOpts = importOpts || {};

		console.log(...LGT, `Importing subclass "${sc.name}" (from "${Parser.sourceJsonToAbv(sc.source)}")`);

		if (DataConverterClass.isStubClass(cls)) return ImportSummary.completedStub();
		if (DataConverterClass.isStubSubclass(sc)) return ImportSummary.completedStub();

		if (importOpts.isTemp) return this._pImportSubclass_pImportToItems(cls, sc, importOpts);
		if (this._actor) return this._pImportSubclass_pImportToActor(cls, sc, importOpts);
		return this._pImportSubclass_pImportToItems(cls, sc, importOpts);
	}

	async _pImportSubclass_pImportToActor (cls, sc, importOpts) {
		const dataBuilderOpts = new ImportListClass.ImportEntryOpts({
			isClassImport: false,
			isCharactermancer: importOpts.isCharactermancer,
		});

		// region (Player) sanity check
		const existingClassItems = this._actor.items.filter(it => it.type === "class");
		if (!existingClassItems.length) {
			const isImportSubclassOnly = await InputUiUtil.pGetUserBoolean({
				title: "Import Class?",
				htmlDescription: "You have selected a subclass to import, but have no class levels. Would you like to import the class too?",
				textYes: "Import Class and Subclass",
				textNo: "Import Only Subclass",
			});

			if (isImportSubclassOnly == null) {
				dataBuilderOpts.isCancelled = true;
				return ImportSummary.cancelled();
			}

			// If the user chooses, switch to the class importer
			if (isImportSubclassOnly === true) {
				const cpyCls = MiscUtil.copy(cls);
				cpyCls.subclasses = [sc];
				return this.pImportClass(cpyCls, importOpts);
			}
		}
		// endregion

		// region Create one array of all class/subclass features
		let allFeatures = MiscUtil.copy(sc.subclassFeatures);

		this.constructor._tagFirstSubclassLoaded(cls, allFeatures);

		allFeatures = Charactermancer_Util.getFilteredFeatures(allFeatures, this._pageFilter, importOpts.filterValues || this._pageFilter.filterBox.getValues());
		// endregion

		return this._pImportClassSubclass_pImportToActor({cls, sc, importOpts, dataBuilderOpts, allFeatures});
	}

	/**
	 * @param cls
	 * @param sc
	 * @param importOpts
	 * @param [opts]
	 * @param [opts.folderId] If this is part of a class import, the folder ID the class data is being imported to.
	 */
	async _pImportSubclass_pImportToItems (cls, sc, importOpts, opts) {
		opts = opts || {};

		const scData = await DataConverterClass.pGetSubclassItem(
			cls,
			sc,
			{
				isAddPermission: true,
				filterValues: importOpts.filterValues || this._pageFilter.filterBox.getValues(),
				pageFilter: this._pageFilter,
			},
		);

		const duplicateMeta = this._getDuplicateMeta({name: scData.name, source: scData.data.source, importOpts});
		if (duplicateMeta.isSkip) {
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
			const imported = await Item.create(scData, {renderSheet: true, temporary: true});

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					new ImportedDocument({
						document: imported,
					}),
				],
			});
		} else if (this._pack) {
			if (duplicateMeta.isOverwrite) return this._pImportEntry_pDoUpdateExistingPackEntity(duplicateMeta, scData);

			const scItem = new Clazz(scData);
			await this._pack.importDocument(scItem);

			await this._pImportEntry_pAddToTargetTableIfRequired([scItem], duplicateMeta);

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					new ImportedDocument({
						document: scItem,
					}),
				],
			});
		} else {
			if (duplicateMeta.isOverwrite) return this._pImportEntry_pDoUpdateExistingDirectoryEntity(duplicateMeta, scData);

			const folderId = opts.folderId || await this._pImportEntry_pGetFolderId(sc);
			if (folderId) scData.folder = folderId;

			const scItem = await Item.create(scData, {renderSheet: false, temporary: false});

			await game.items.set(scItem.id, scItem);

			return new ImportSummary({
				status: UtilApplications.TASK_EXIT_COMPLETE,
				imported: [
					new ImportedDocument({
						document: scItem,
					}),
				],
			});
		}
	}

	async _pImportEntry_pDoUpdateCharacter (actUpdate, cls, sc, curLevel, existingClassItem, existingSubclassItem, dataBuilderOpts) {
		// `existingClassItem` is the exact class features item the user wants us to import into, but pulling out the
		//    others allows us to calculate total spell slots
		const otherExistingClassItems = this._actor.items
			.filter(it => it.type === "class")
			.filter(it => it !== existingClassItem);

		// (As above)
		const otherExistingSubclassItems = this._actor.items
			.filter(it => it.type === "subclass")
			.filter(it => it !== existingSubclassItem);

		await this._pImportEntry_pDoUpdateCharacter_xp({actUpdate, dataBuilderOpts, otherExistingClassItems});
		await this._pImportEntry_pDoUpdateCharacter_profBonus({actUpdate, dataBuilderOpts});
		await this._pImportEntry_pDoUpdateCharacter_spellcasting({actUpdate, cls, sc, dataBuilderOpts, otherExistingClassItems, otherExistingSubclassItems});
		await this._pImportEntry_pDoUpdateCharacter_psionics({actUpdate, cls, sc, dataBuilderOpts, otherExistingClassItems, otherExistingSubclassItems});
		await this._pImportEntry_pDoUpdateCharacter_hp({actUpdate, cls, dataBuilderOpts});
		await this._pImportEntry_pDoUpdateCharacter_languages({actUpdate, cls, dataBuilderOpts});
		if (dataBuilderOpts.isCancelled) return;

		if (Object.keys(actUpdate.data).length) await UtilDocuments.pUpdateDocument(this._actor, actUpdate);
	}

	async _pImportEntry_pDoUpdateCharacter_xp ({actUpdate, dataBuilderOpts, otherExistingClassItems}) {
		if (Config.get("importClass", "isSetXp")) return;

		const totalLevel = otherExistingClassItems
			.map(it => it.data.data.levels || 0)
			.reduce((a, b) => a + b, 0)
			+ (dataBuilderOpts.targetLevel || 0);

		if (totalLevel <= 0) return;

		const xpObj = ((actUpdate.data.details = actUpdate.data.details || {}).xp = actUpdate.data.details.xp || {});
		const curXp = MiscUtil.get(this._actor, "data", "data", "details", "xp", "value") || 0;
		const tgtXp = Parser.LEVEL_XP_REQUIRED[totalLevel - 1];
		const nxtXp = Parser.LEVEL_XP_REQUIRED[Math.min(totalLevel, 19)];
		if (curXp < tgtXp) {
			xpObj.pct = 0;
			xpObj.value = tgtXp;
		} else {
			xpObj.pct = (curXp / nxtXp) * 100;
		}
		xpObj.max = nxtXp;
	}

	async _pImportEntry_pDoUpdateCharacter_profBonus ({actUpdate, dataBuilderOpts}) {
		// Update proficiency if less than our target
		const curProfBonus = MiscUtil.get(this._actor, "data", "data", "attributes", "prof");
		const targetProf = Math.floor((dataBuilderOpts.targetLevel - 1) / 4) + 2;
		if (curProfBonus < targetProf) (actUpdate.data.attributes = actUpdate.data.attributes || {}).prof = targetProf;
	}

	async _pImportEntry_pDoUpdateCharacter_spellcasting ({actUpdate, cls, sc, dataBuilderOpts, otherExistingClassItems, otherExistingSubclassItems}) {
		const progressionMeta = Charactermancer_Class_Util.getCasterProgression(cls, sc, {targetLevel: dataBuilderOpts.targetLevel, otherExistingClassItems, otherExistingSubclassItems});

		const isAnySlotMod = this._pImportEntry_pDoUpdateCharacter_spellcasting_slots({actUpdate, dataBuilderOpts, progressionMeta});
		if (!isAnySlotMod) {
			delete actUpdate.data?.spells;
			delete dataBuilderOpts.postItemActorUpdate?.data?.spells;
		}

		const {spellAbility, totalSpellcastingLevels} = progressionMeta;
		if (spellAbility) (actUpdate.data.attributes = actUpdate.data.attributes || {}).spellcasting = spellAbility;

		// Set spell points, where appropriate
		await this._pImportEntry_pDoUpdateCharacter_spellcasting_spellPoints({actUpdate, totalSpellcastingLevels});
	}

	_pImportEntry_pDoUpdateCharacter_spellcasting_slots ({actUpdate, dataBuilderOpts, progressionMeta}) {
		const {casterProgression, totalSpellcastingLevels, maxPactCasterLevel} = progressionMeta;

		if (!totalSpellcastingLevels && casterProgression !== "pact") return;

		let isAnyMod = false;
		actUpdate.data.spells = actUpdate.data.spells || {};
		// Store a copy of the update to be applied after items have been applied--this allows us to correct any
		//   spell slot counts which get broken by setting a caster mode in a class item.
		const postDataSpells = MiscUtil.getOrSet(dataBuilderOpts.postItemActorUpdate, "data", "spells", {});

		if (totalSpellcastingLevels) {
			// always use the "full" caster table, as other caster progressions are converted to overall full-caster levels
			const spellSlots = UtilDataConverter.CASTER_TYPE_TO_PROGRESSION.full;
			let maxLevelSpells = spellSlots[totalSpellcastingLevels - 1] || spellSlots.last();

			maxLevelSpells.forEach((slots, i) => {
				if (slots === 0) return;
				const lvlProp = `spell${i + 1}`;

				const existingMax = MiscUtil.get(this._actor, "data", "data", "spells", lvlProp, "max");
				const existingValue = MiscUtil.get(this._actor, "data", "data", "spells", lvlProp, "value");
				if (existingMax != null) {
					if (existingMax < slots) {
						isAnyMod = true;

						const delta = slots - existingMax;

						actUpdate.data.spells[lvlProp] = {max: slots, value: existingValue + delta};
						postDataSpells[lvlProp] = {max: slots, value: existingValue + delta};
					}
				} else {
					isAnyMod = true;
					actUpdate.data.spells[lvlProp] = {max: slots, value: slots};
					postDataSpells[lvlProp] = {max: slots, value: slots};
				}
			});

			return isAnyMod;
		}

		if (casterProgression === "pact") {
			const existingMax = MiscUtil.get(this._actor, "data", "data", "spells", "pact", "max");
			const existingValue = MiscUtil.get(this._actor, "data", "data", "spells", "pact", "value");

			const slots = UtilDataConverter.CASTER_TYPE_TO_PROGRESSION.pact[maxPactCasterLevel - 1].find(Boolean);

			if (existingMax != null) {
				if (existingMax < slots) {
					isAnyMod = true;

					const delta = slots - existingMax;

					actUpdate.data.spells.pact = {max: slots, value: existingValue + delta};
					postDataSpells.pact = {max: slots, value: existingValue + delta};
				}
			} else {
				isAnyMod = true;
				actUpdate.data.spells.pact = {max: slots, value: slots};
				postDataSpells.pact = {max: slots, value: slots};
			}

			return isAnyMod;
		}

		return false;
	}

	async _pImportEntry_pDoUpdateCharacter_spellcasting_spellPoints ({actUpdate, totalSpellcastingLevels}) {
		if (
			!totalSpellcastingLevels
			|| Config.get("importSpell", Config.getSpellPointsKey({actorType: this._actor?.type})) === ConfigConsts.C_SPELL_POINTS_MODE__DISABLED
		) return;
		return Config.get("importSpell", "spellPointsResource") === ConfigConsts.C_SPELL_POINTS_RESOURCE__SHEET_ITEM
			? UtilActors.pGetCreateActorSpellPointsItem({actor: this._actor, totalSpellcastingLevels})
			: this._pImportEntry_pDoUpdateCharacter_spellcasting_spellPsiPoints_resource({
				actUpdate,
				amount: UtilDataConverter.getSpellPointTotal({totalSpellcastingLevels}),
				label: "Spell Points",
				resource: Config.getSpellPointsResource(),
			});
	}

	async _pImportEntry_pDoUpdateCharacter_spellcasting_spellPsiPoints_resource ({actUpdate, amount, label, resource}) {
		const propPathResource = (resource || "").trim().split(".");

		if (!propPathResource.length) {
			const msg = `Could not update ${label} total\u2014resource "${resource}" was not valid!`;
			console.warn(...LGT, msg);
			ui.notifications.warn(msg);
			return;
		}

		const propPathValue = [...propPathResource, "value"];
		const propPathMax = [...propPathResource, "max"];

		const actorData = (this._actor.data._source || this._actor.data);
		const curVal = MiscUtil.get(actorData, "data", ...propPathValue) || 0;
		const curMax = MiscUtil.get(actorData, "data", ...propPathMax) || 0;

		if (amount > curMax) {
			const deltaCur = (amount - curMax);
			MiscUtil.set(actUpdate, "data", ...propPathValue, curVal + deltaCur);
			MiscUtil.set(actUpdate, "data", ...propPathMax, amount);

			const propPathLabel = [...propPathResource, "label"];
			if (!MiscUtil.get(actorData, "data", ...propPathLabel)) {
				MiscUtil.set(actUpdate, "data", ...propPathLabel, label);
			}
		}
	}

	async _pImportEntry_pDoUpdateCharacter_psionics ({actUpdate, cls, sc, dataBuilderOpts, otherExistingClassItems, otherExistingSubclassItems}) {
		const {totalMysticLevels} = Charactermancer_Class_Util.getMysticProgression({cls, targetLevel: dataBuilderOpts.targetLevel, otherExistingClassItems, otherExistingSubclassItems});

		// Set psi points, where appropriate
		await this._pImportEntry_pDoUpdateCharacter_psionics_psiPoints({actUpdate, totalMysticLevels});
	}

	async _pImportEntry_pDoUpdateCharacter_psionics_psiPoints ({actUpdate, totalMysticLevels}) {
		if (!totalMysticLevels) return;
		return Config.get("importPsionic", "psiPointsResource") === ConfigConsts.C_SPELL_POINTS_RESOURCE__SHEET_ITEM
			? UtilActors.pGetCreateActorPsiPointsItem({actor: this._actor, totalMysticLevels})
			: this._pImportEntry_pDoUpdateCharacter_spellcasting_spellPsiPoints_resource({
				actUpdate,
				amount: UtilDataConverter.getPsiPointTotal({totalMysticLevels}),
				label: "Psi Points",
				resource: Config.getPsiPointsResource(),
			});
	}

	async _pImportEntry_pDoUpdateCharacter_hp ({actUpdate, cls, dataBuilderOpts}) {
		if (!dataBuilderOpts.isClassImport || !Charactermancer_Class_HpIncreaseModeSelect.isHpAvailable(cls)) return;

		const conMod = Parser.getAbilityModNumber(Charactermancer_Util.getCurrentAbilityScores(this._actor).con); // Factor in effects when adding HP

		// You gain the hit points from your new class as described for levels after 1st.
		//   You gain the 1st-level hit points for a class only when you are a 1st-level character.
		//   --PHB, p163
		const isFirstHpGain = dataBuilderOpts.isIncludesLevelOne && dataBuilderOpts.proficiencyImportMode !== Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS;

		let hpIncrease = isFirstHpGain ? (cls.hd.number * cls.hd.faces) + conMod : 0;

		const numLevels = isFirstHpGain ? dataBuilderOpts.numLevels - 1 : dataBuilderOpts.numLevels;

		switch (dataBuilderOpts.hpIncreaseMode) {
			case Charactermancer_Class_HpIncreaseModeSelect.MODE_TAKE_AVERAGE: {
				const avg = Math.ceil(cls.hd.number * ((cls.hd.faces + 1) / 2));
				hpIncrease += numLevels * Math.max((avg + conMod), 1);
				break;
			}

			case Charactermancer_Class_HpIncreaseModeSelect.MODE_ROLL: {
				for (let i = 0; i < numLevels; ++i) {
					const roll = new Roll(`${cls.hd.number}d${cls.hd.faces} + ${conMod}`);
					await roll.evaluate();
					hpIncrease += Math.max(roll.total, 1);
					// Post the roll to chat
					await roll.toMessage({
						flavor: `HP Increase`,
						speaker: {
							actor: this._actor.id,
							alias: this._actor.name,
							scene: null,
							token: null,
						},
					});
				}
				break;
			}

			case Charactermancer_Class_HpIncreaseModeSelect.MODE_DO_NOT_INCREASE: {
				hpIncrease = 0;
				break;
			}

			default: throw new Error(`Unhandled Hit Points increase mode "${dataBuilderOpts.hpIncreaseMode}"`);
		}

		if (hpIncrease) {
			const {value: curValue, max: curMax} = Charactermancer_Util.getBaseHp(this._actor);

			switch (dataBuilderOpts.proficiencyImportMode) {
				case Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS: {
					const hpCurNxt = curValue + hpIncrease;
					const hpMaxNxt = curMax + hpIncrease;

					MiscUtil.set(actUpdate, "data", "attributes", "hp", "value", hpCurNxt);
					MiscUtil.set(actUpdate, "data", "attributes", "hp", "max", hpMaxNxt);

					break;
				}

				case Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY: {
					const hpCurNxt = (isFirstHpGain ? 0 : curValue) + hpIncrease;
					const hpMaxNxt = (isFirstHpGain ? 0 : curMax) + hpIncrease;

					MiscUtil.set(actUpdate, "data", "attributes", "hp", "value", hpCurNxt);
					MiscUtil.set(actUpdate, "data", "attributes", "hp", "max", hpMaxNxt);

					break;
				}

				case Charactermancer_Class_ProficiencyImportModeSelect.MODE_NONE: break;

				default: throw new Error(`Unknown proficiency import mode "${dataBuilderOpts.proficiencyImportMode}"`);
			}
		}
	}

	async _pImportEntry_pDoUpdateCharacter_languages ({actUpdate, cls, dataBuilderOpts}) {
		await DataConverter.pFillActorLanguageData(
			MiscUtil.get(this._actor, "data", "data", "traits", "languages"),
			cls.languageProficiencies,
			actUpdate.data,
			dataBuilderOpts,
		);
	}

	async _pImportEntry_pDoUpdateCharacter_pPopulateLevelOneProficienciesAndEquipment (actUpdate, cls, sc, dataBuilderOpts) {
		const out = {
			chosenProficiencies: {},
		};

		// region saving throws; weapons/armor/tools
		out.chosenProficiencies = await this._pImportEntry_pDoUpdateCharacter_pPopulateProficienciesFrom(actUpdate, cls.startingProficiencies, cls.proficiency, Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return;
		// endregion

		// region Equipment
		await this._pImportEntry_pDoUpdateCharacter_pPopulateEquipment(cls, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return;
		// endregion

		return out;
	}

	async _pImportEntry_pDoUpdateCharacter_pPopulateProficienciesFrom (actUpdate, profs, savingThrowProfs, mode, dataBuilderOpts) {
		const out = {
			skills: {},
		};

		// region Skills
		if (profs?.skills) {
			const skills = await DataConverter.pFillActorSkillData(
				MiscUtil.get(this._actor, "data", "data", "skills"),
				profs.skills,
				actUpdate.data,
				dataBuilderOpts,
			);

			if (dataBuilderOpts.isCancelled) return out;

			out.skills = skills; // Save the skills the user chose, so that we can add these to the final class item
		}
		// endregion

		// region Other proficiencies (armor, weapons, tools)
		const formDataOtherProfs = await Charactermancer_Class_StartingProficiencies.pGetUserInput({
			mode,
			primaryProficiencies: mode === Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY ? profs : null,
			multiclassProficiencies: mode === Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS ? profs : null,
			savingThrowsProficiencies: savingThrowProfs,
			existingProficienciesFvttArmor: MiscUtil.get(this._actor, "data", "data", "traits", "armorProf"),
			existingProficienciesFvttWeapons: MiscUtil.get(this._actor, "data", "data", "traits", "weaponProf"),
			existingProficienciesFvttTools: MiscUtil.get(this._actor, "data", "data", "traits", "toolProf"),
			existingProficienciesFvttSavingThrows: Charactermancer_Class_StartingProficiencies.getExistingProficienciesFvttSavingThrows(this._actor),
		});
		if (formDataOtherProfs == null) return dataBuilderOpts.isCancelled = true;
		if (formDataOtherProfs === VeCt.SYM_UI_SKIP) return;

		Charactermancer_Class_StartingProficiencies.applyFormDataToActorUpdate(actUpdate, formDataOtherProfs);
		// endregion

		return out;
	}

	async _pImportEntry_pDoUpdateCharacter_pPopulateMulticlassProficiencies (actUpdate, cls, sc, dataBuilderOpts) {
		const out = {
			chosenProficiencies: {},
		};

		if (cls.multiclassing && cls.multiclassing.proficienciesGained) {
			out.chosenProficiencies = await this._pImportEntry_pDoUpdateCharacter_pPopulateProficienciesFrom(actUpdate, cls.multiclassing.proficienciesGained, null, Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS, dataBuilderOpts);
			if (dataBuilderOpts.isCancelled) return;
		}

		return out;
	}

	_getExistingClassItems (cls) { return Charactermancer_Class_Util.getExistingClassItems(this._actor, cls); }
	_getExistingSubclassItems (cls, sc) { return Charactermancer_Class_Util.getExistingSubclassItems(this._actor, cls, sc); }

	static _CurLevelMeta = class {
		constructor ({curLevel = 0, existingCLassItem = null, existingSubclassItem = null} = {}) {
			this.curLevel = curLevel;
			this.existingClassItem = existingCLassItem;
			this.existingSubclassItem = existingSubclassItem;
		}
	};

	async _pImportEntry_pGetCurLevelFillClassData (actUpdate, cls, sc, importOpts, dataBuilderOpts) {
		const outCurLevelMeta = new this.constructor._CurLevelMeta();

		const proficiencyMeta = await this._pGetProficiencyMeta({actUpdate, cls, sc, dataBuilderOpts});
		if (dataBuilderOpts.isCancelled) return;

		const {existingClassItem, existingSubclassItem} = await this._pImportEntry_pGetUserExistingClassSubclassItem({cls, sc, dataBuilderOpts});
		if (dataBuilderOpts.isCancelled) return;

		dataBuilderOpts.classItem = existingClassItem;
		dataBuilderOpts.subclassItem = existingSubclassItem;
		outCurLevelMeta.existingClassItem = existingClassItem;
		outCurLevelMeta.existingSubclassItem = existingSubclassItem;

		await this._pImportEntry_pFillClassData({cls, sc, proficiencyMeta, outCurLevelMeta, importOpts, dataBuilderOpts});
		await this._pImportEntry_pFillSubclassData({cls, sc, proficiencyMeta, outCurLevelMeta, importOpts, dataBuilderOpts});

		return outCurLevelMeta;
	}

	async _pGetProficiencyMeta ({actUpdate, cls, sc, dataBuilderOpts}) {
		if (!dataBuilderOpts.isClassImport || !dataBuilderOpts.isIncludesLevelOne) return {};

		switch (dataBuilderOpts.proficiencyImportMode) {
			case Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS: {
				return this._pImportEntry_pDoUpdateCharacter_pPopulateMulticlassProficiencies(actUpdate, cls, sc, dataBuilderOpts);
			}
			case Charactermancer_Class_ProficiencyImportModeSelect.MODE_PRIMARY: {
				return this._pImportEntry_pDoUpdateCharacter_pPopulateLevelOneProficienciesAndEquipment(actUpdate, cls, sc, dataBuilderOpts);
			}
			case Charactermancer_Class_ProficiencyImportModeSelect.MODE_NONE: {
				return {};
			}
			default: throw new Error(`Unknown proficiency import mode "${dataBuilderOpts.proficiencyImportMode}"`);
		}
	}

	/**
	 * Find an existing item if it exists, so we can update it.
	 * This is both over- and under-engineered. It is under-engineered in the sense that it does not respect identifiers
	 * (i.e., a single class+subclass import can end up changing a class+subclass item which do not have a parent-child
	 * relationship). It is over-engineered in the sense that it allows choosing nonsensical combinations of
	 * class+subclass items instead of limiting the user to a "you probably meant to do X" selection.
	 */
	async _pImportEntry_pGetUserExistingClassSubclassItem ({cls, sc, dataBuilderOpts}) {
		const existingClassItems = this._getExistingClassItems(cls);
		const existingSubclassItems = this._getExistingSubclassItems(cls, sc);

		if (!existingClassItems.length && !existingSubclassItems.length) return {};

		const isChooseClass = cls && existingClassItems.length > 1;
		const isChooseSubclass = sc && existingSubclassItems.length > 1;

		if (isChooseClass && isChooseSubclass) {
			const [isDataEntered, classSubclassItemSelection] = await this._pGetUserClassSubclassItems({cls, sc, existingClassItems, existingSubclassItems});
			if (!isDataEntered) {
				dataBuilderOpts.isCancelled = true;
				return {};
			}
			return classSubclassItemSelection;
		}

		if (isChooseClass) {
			return {
				existingClassItem: await this._pGetUserClassSubclassItem({dataBuilderOpts, clsOrSc: cls, existingItems: existingClassItems, nameUnnamed: "(Unnamed Class)"}),
				existingSubclassItem: existingSubclassItems[0],
			};
		}

		if (isChooseSubclass) {
			return {
				existingClassItem: existingClassItems[0],
				existingSubclassItem: await this._pGetUserClassSubclassItem({dataBuilderOpts, clsOrSc: sc, existingItems: existingSubclassItems, nameUnnamed: "(Unnamed Subclass)"}),
			};
		}

		return {
			existingClassItem: existingClassItems[0],
			existingSubclassItem: existingSubclassItems[0],
		};
	}

	async _pImportEntry_pFillClassData ({cls, sc, proficiencyMeta, outCurLevelMeta, importOpts, dataBuilderOpts}) {
		const {existingClassItem} = outCurLevelMeta;

		const classItemData = await DataConverterClass.pGetClassItem(
			cls,
			{
				sc,
				filterValues: importOpts.filterValues || this._pageFilter.filterBox.getValues(),
				startingSkills: proficiencyMeta.chosenProficiencies && proficiencyMeta.chosenProficiencies.skills
					? Object.keys(proficiencyMeta.chosenProficiencies.skills)
					: [],
				proficiencyImportMode: dataBuilderOpts.proficiencyImportMode,
				level: dataBuilderOpts.targetLevel,
				isClsDereferenced: true,
				actor: this._actor,
			},
		);

		if (existingClassItem) {
			let isUpdate = false;
			const update = {_id: existingClassItem.id};

			const description = classItemData.data.description.value;
			if (description && !(existingClassItem.data.data.description?.value || "").trim()) {
				isUpdate = true;
				MiscUtil.set(update, "data", "description", "value", description);
			}

			let curLevel = existingClassItem.data.data.levels;
			if (curLevel) {
				if (dataBuilderOpts.targetLevel > curLevel) {
					isUpdate = true;
					MiscUtil.set(update, "data", "levels", dataBuilderOpts.targetLevel);
				}
			}

			dataBuilderOpts.classItemUpdate = update;
			dataBuilderOpts.isPersistClassItemUpdate = dataBuilderOpts.isPersistClassItemUpdate || isUpdate;

			outCurLevelMeta.curLevel = curLevel || 0;
			outCurLevelMeta.existingClassItem = existingClassItem;
			return;
		}

		// If there was no existing item, create a new class item
		dataBuilderOpts.classItemToCreate = classItemData;
	}

	async _pImportEntry_pFillSubclassData ({cls, sc, proficiencyMeta, outCurLevelMeta, importOpts, dataBuilderOpts}) {
		if (!sc) return;

		const {existingSubclassItem} = outCurLevelMeta;

		const subclassItemData = await DataConverterClass.pGetSubclassItem(
			cls,
			sc,
			{
				filterValues: importOpts.filterValues || this._pageFilter.filterBox.getValues(),
				proficiencyImportMode: dataBuilderOpts.proficiencyImportMode,
				isScDereferenced: true,
				actor: this._actor,
			},
		);

		if (existingSubclassItem) {
			let isUpdate = false;
			const update = {_id: existingSubclassItem.id};

			const description = subclassItemData.data.description.value;
			if (description && !(existingSubclassItem.data.data.description?.value || "").trim()) {
				isUpdate = true;
				MiscUtil.set(update, "data", "description", "value", description);
			}

			dataBuilderOpts.subclassItemUpdate = update;
			dataBuilderOpts.isPersistSubclassItemUpdate = dataBuilderOpts.isPersistSubclassItemUpdate || isUpdate;

			return;
		}

		dataBuilderOpts.subclassItemToCreate = subclassItemData;
	}

	async _pGetUserClassSubclassItem ({dataBuilderOpts, clsOrSc, existingItems, nameUnnamed}) {
		const titlePart = clsOrSc.name || nameUnnamed;

		const ix = await InputUiUtil.pGetUserEnum({
			values: existingItems,
			placeholder: "Select Existing Item...",
			title: `Select Existing Item to Import ${titlePart} Levels To`,
			fnDisplay: fvIt => {
				if (fvIt == null) return `(Create New Item)`;
				return fvIt.name || nameUnnamed;
			},
			isAllowNull: true,
		});

		if (ix == null) {
			dataBuilderOpts.isCancelled = true;
			return null;
		}

		return existingItems[ix];
	}

	async _pGetUserClassSubclassItems ({cls, sc, existingClassItems, existingSubclassItems}) {
		const titlePart = `${cls.name || "(Unnamed class)"} (${sc.name || "(Unnamed subclass)"})`;

		const {$modalInner, doClose, pGetResolved, doAutoResize: doAutoResizeModal} = await UtilApplications.pGetShowApplicationModal({
			title: `Select Existing Items to Import ${titlePart} Levels To`,
		});
		const comp = BaseComponent.fromObject({ixItemClass: null, ixItemSubclass: null}, "*");

		const $btnOk = $(`<button class="btn btn-primary mr-2">OK</button>`)
			.click(async () => {
				const out = {
					existingClassItem: existingClassItems[comp._state.ixItemSubclass],
					existingSubclassItem: existingSubclassItems[comp._state.ixItemSubclass],
				};

				return doClose(true, out);
			});
		const $btnCancel = $(`<button class="btn btn-default">Cancel</button>`)
			.click(() => doClose(false));

		const $selClass = ComponentUiUtil.$getSelEnum(
			comp,
			"ixItemClass",
			{
				values: existingClassItems,
				fnDisplay: fvIt => fvIt == null ? `(Create New Item)` : (fvIt.name || "(Unnamed class)"),
				displayNullAs: "(Create New Item)",
				isAllowNull: true,
				isSetIndexes: true,
			},
		);

		const $selSubclass = ComponentUiUtil.$getSelEnum(
			comp,
			"ixItemSubclass",
			{
				values: existingSubclassItems,
				fnDisplay: fvIt => fvIt == null ? `(Create New Item)` : (fvIt.name || "(Unnamed subclass)"),
				displayNullAs: "(Create New Item)",
				isAllowNull: true,
				isSetIndexes: true,
			},
		);

		$$($modalInner)`<div class="ve-flex-col">
			<label class="split-v-center mb-2"><div class="no-shrink mr-2 w-100p text-right">Class item</div>${$selClass}</label>
			<label class="split-v-center"><div class="no-shrink mr-2 w-100p text-right">Subclass item</div>${$selSubclass}</label>
		</div>`;
		$$`<div class="ve-flex-v-center ve-flex-h-right no-shrink pb-1 pt-1 px-1">${$btnOk}${$btnCancel}</div>`.appendTo($modalInner);
		$selClass.focus();

		doAutoResizeModal();

		return pGetResolved();
	}

	async _pImportCasterCantrips (cls, sc, curLevel, importOpts, dataBuilderOpts) {
		if (cls._foundryIsSkipImportCantrips) return;

		const cantripProgressionMeta = Charactermancer_Spell_Util.getCasterCantripProgressionMeta({cls, sc, curLevel, targetLevel: dataBuilderOpts.targetLevel});
		if (!cantripProgressionMeta) return;

		const {maxCantripsHigh, deltaMaxCantrips} = cantripProgressionMeta;
		if (!deltaMaxCantrips || !maxCantripsHigh) return;

		const formData = await Charactermancer_Spell_Modal.pGetUserInput({
			actor: this._actor,
			existingClass: dataBuilderOpts.classItemUpdate ? cls : null,
			existingCasterMeta: Charactermancer_Spell_Util.getExistingCasterMeta({cls, sc, actor: this._actor, targetLevel: dataBuilderOpts.targetLevel}),
			spellDatas: (await Vetools.pGetAllSpells({isIncludeLoadedBrew: true, isApplyBlocklist: true})).spell,
			className: cls.name,
			classSource: cls.source,
			brewClassSpells: cls.classSpells,
			subclassName: sc?.name,
			subclassSource: sc?.source,
			brewSubclassSpells: sc?.subclassSpells,
			brewSubSubclassSpells: sc?.subSubclassSpells,

			maxLevel: 0,
			maxLearnedCantrips: maxCantripsHigh,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		await Charactermancer_Spell.pApplyFormDataToActor(this._actor, formData, {cls, sc});
	}

	async _pImportEntry_pFillPreparedSpells (cls, sc, curLevel, dataBuilderOpts) {
		// This data is technically only usable in Tidy5e, but, set it regardless, in case the user later switches sheets
		// if (!UtilCompat.isTidy5eSheetActive()) return

		const spellsPreparedFormula = Charactermancer_Spell_Util.getMaxPreparedSpellsFormula({cls, sc});
		if (!spellsPreparedFormula) return;

		const existing = this._actor.effects.contents.find(it => (it.data?.label || "").toLowerCase().trim() === "prepared spells");
		if (existing) return;

		dataBuilderOpts.effects.push(UtilActiveEffects.getGenericEffect({
			key: "data.details.maxPreparedSpells",
			value: spellsPreparedFormula,
			// N.b.: Tidy5e does not (as of 2022-01-05) define their "maxPreparedSpells" as numeric (or indeed, anything), so UPGRADE/DOWNGRADE don't work. Use OVERRIDE instead.
			mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
			label: `Prepared Spells`,
			icon: await Vetools.pOptionallySaveImageToServerAndGetUrl(await DataConverterClass.pGetClassImagePath(cls)),
			disabled: false,
			priority: UtilActiveEffects.PRIORITY_BASE,
			originActor: this._actor,
			originActorItem: dataBuilderOpts.classItem,
		}));
	}

	async _pImportPreparedCasterSpells (cls, sc, curLevel, dataBuilderOpts) {
		if (cls._foundryIsSkipImportPreparedSpells) return;

		const casterProgressionMeta = Charactermancer_Spell_Util.getCasterProgressionMeta({
			casterProgression: DataConverter.getMaxCasterProgression(cls.casterProgression, sc?.casterProgression),
			curLevel,
			targetLevel: dataBuilderOpts.targetLevel,
			isBreakpointsOnly: true,
		});
		if (!casterProgressionMeta) return;

		const {spellLevelLow, spellLevelHigh, deltaLevels} = casterProgressionMeta;

		const doImport = await InputUiUtil.pGetUserBoolean({
			title: `Populate Spellbook`,
			htmlDescription: `<p>Do you want to populate the spellbook for this class (for class level${deltaLevels === 1 ? "" : "s"} ${deltaLevels === 1 ? dataBuilderOpts.targetLevel : `${curLevel + 1}-${dataBuilderOpts.targetLevel}`})?</p>`,
			textYes: "Yes",
			textNo: "No",
		});

		if (!doImport) return;

		const isBrewSource = sc ? BrewUtil2.hasSourceJson(sc.source) : BrewUtil2.hasSourceJson(cls.source);
		const isUaSource = !isBrewSource && (sc ? SourceUtil.isNonstandardSource(sc.source) : SourceUtil.isNonstandardSource(cls.source));

		const allSpells = (await Vetools.pGetAllSpells({
			isFilterNonStandard: !isUaSource,
			additionalSourcesBrew: isBrewSource ? this._getBrewSpellSources(cls, sc) : null,
			isApplyBlocklist: true,
		})).spell;

		const spellsToImport = await Charactermancer_Class_Util.pGetPreparableSpells(allSpells, cls, spellLevelLow, spellLevelHigh);
		if (!spellsToImport.length) return;

		const {ImportListSpell} = await import("./ImportListSpell.js");
		const importListSpell = new ImportListSpell({actor: this._actor});
		await importListSpell.pInit();

		for (const spell of spellsToImport) {
			const existingSpell = DataConverterSpell.getActorSpell(this._actor, spell.name, spell.source);
			if (existingSpell) continue;

			await importListSpell.pImportEntry(
				spell,
				{
					opts_pGetSpellItem: {
						...(await UtilActors.pGetActorSpellItemOpts()),
						ability: dataBuilderOpts.spellcastingAbility,
					},
				},
			);
		}
	}

	_getBrewSpellSources (cls, sc) {
		const out = new Set();

		if (!Parser.SOURCE_JSON_TO_ABV[cls.source]) out.add(cls.source);
		if (sc && !Parser.SOURCE_JSON_TO_ABV[sc.source]) out.add(sc.source);

		if (cls.classSpells) {
			cls.classSpells
				.filter(it => it.source && !Parser.SOURCE_JSON_TO_ABV[it.source])
				.forEach(({source}) => out.add(source));
		}
		if (sc && sc.subclassSpells) {
			sc.subclassSpells
				.filter(it => it.source && !Parser.SOURCE_JSON_TO_ABV[it.source])
				.forEach(({source}) => out.add(source));
		}

		return [...out];
	}

	async _pImportEntry_pFillItemArrayAdditionalSpells (cls, subclasses, curLevel, dataBuilderOpts) {
		// region From class
		const casterProgressionMeta = Charactermancer_Spell_Util.getCasterProgressionMeta({casterProgression: cls.casterProgression, curLevel, targetLevel: dataBuilderOpts.targetLevel});

		const formData = await Charactermancer_AdditionalSpellsSelect.pGetUserInput({
			additionalSpells: cls.additionalSpells,
			sourceHintText: cls.name,
			curLevel: curLevel,
			targetLevel: dataBuilderOpts.targetLevel,
			spellLevelLow: casterProgressionMeta ? casterProgressionMeta.spellLevelLow : null,
			spellLevelHigh: casterProgressionMeta ? casterProgressionMeta.spellLevelHigh : null,
			isStandalone: true,
		});

		if (formData == null) return dataBuilderOpts.isCancelled = true;
		if (formData !== VeCt.SYM_UI_SKIP) {
			await Charactermancer_AdditionalSpellsSelect.pApplyFormDataToActor(
				this._actor,
				formData,
				{
					abilityAbv: cls.spellcastingAbility,
				},
			);
		}
		// endregion

		// region From subclass
		for (const sc of subclasses) {
			const casterProgressionMeta = Charactermancer_Spell_Util.getCasterProgressionMeta({casterProgression: sc?.casterProgression || cls.casterProgression, curLevel, targetLevel: dataBuilderOpts.targetLevel});

			const formData = await Charactermancer_AdditionalSpellsSelect.pGetUserInput({
				additionalSpells: sc.additionalSpells,
				sourceHintText: sc.name,
				curLevel: curLevel,
				targetLevel: dataBuilderOpts.targetLevel,
				spellLevelLow: casterProgressionMeta ? casterProgressionMeta.spellLevelLow : null,
				spellLevelHigh: casterProgressionMeta ? casterProgressionMeta.spellLevelHigh : null,
				isStandalone: true,
			});

			if (formData == null) return dataBuilderOpts.isCancelled = true;
			if (formData === VeCt.SYM_UI_SKIP) continue;

			await Charactermancer_AdditionalSpellsSelect.pApplyFormDataToActor(
				this._actor,
				formData,
				{
					abilityAbv: sc.spellcastingAbility,
				},
			);
		}
		// endregion
	}

	async _pImportEntry_pHandleFeatures (cls, sc, allFeatures, selectedLevelIndices, importOpts, dataBuilderOpts) {
		if (cls._foundryAllFeatures) {
			await this._pImportEntry_pFillItemArrayPredefinedFeatures({
				allPreloadedFeatures: cls._foundryAllFeatures,
				cls,
				sc,
				importOpts,
				dataBuilderOpts,
			});
			this._pImportEntry_handleConDifference({
				conInitial: cls._foundryConInitial,
				conFinal: cls._foundryConFinal,
				isConPreApplied: true,
				dataBuilderOpts,
			});
			return;
		}

		const allChosenFeatures = allFeatures.filter(f => selectedLevelIndices.includes(f.level - 1));
		const fillMeta = await this._pImportEntry_pFillItemArrayFeatures(allChosenFeatures, importOpts, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return;
		this._pImportEntry_handleConDifference({
			conInitial: fillMeta.conInitial,
			conFinal: fillMeta.conFinal,
			dataBuilderOpts,
		});
	}

	async _pImportEntry_pFillItemArrayPredefinedFeatures (
		{
			allPreloadedFeatures,
			cls,
			sc,
			importOpts,
			dataBuilderOpts,
		},
	) {
		const {ImportListClassFeature} = await import("./ImportListClassFeature.js");
		const {ImportListOptionalFeature} = await import("./ImportListOptionalFeature.js");

		const importListClassFeature = new ImportListClassFeature({actor: this._actor});
		await importListClassFeature.pInit();

		const importListOptionalFeature = new ImportListOptionalFeature({actor: this._actor});
		await importListOptionalFeature.pInit();

		for (const loaded of allPreloadedFeatures) {
			if (loaded._foundryIsIgnoreFeature) continue;

			switch (loaded.type) {
				case "optionalfeature": {
					const importSummary = await importListOptionalFeature.pImportEntry(
						loaded.entity,
						{
							isCharactermancer: true,
							isLeaf: true,
						},
					);

					const importMetasWrapped = this.constructor._getLevelledEmbeddedDocuments({importSummary, level: loaded.entity.level});
					const tgt = loaded.entity?.ancestorSubclassName
						? dataBuilderOpts.importedSubclassFeatureLevelledEmbeddedDocuments
						: dataBuilderOpts.importedClassFeatureLevelledEmbeddedDocuments;
					tgt.push(...importMetasWrapped);

					break;
				}
				case "classFeature": {
					const importSummary = await importListClassFeature.pImportEntry(
						loaded.entity,
						{
							isCharactermancer: true,
							isLeaf: true,
							spellcastingAbilityAbv: cls.spellcastingAbility,
						},
					);
					dataBuilderOpts.importedClassFeatureLevelledEmbeddedDocuments.push(
						...this.constructor._getLevelledEmbeddedDocuments({importSummary, level: loaded.entity.level}),
					);
					break;
				}
				case "subclassFeature": {
					const importSummary = await importListClassFeature.pImportEntry(
						loaded.entity,
						{
							isCharactermancer: true,
							isLeaf: true,
							spellcastingAbilityAbv: sc?.spellcastingAbility,
						},
					);
					dataBuilderOpts.importedSubclassFeatureLevelledEmbeddedDocuments.push(
						...this.constructor._getLevelledEmbeddedDocuments({importSummary, level: loaded.entity.level}),
					);
					break;
				}
				default: throw new Error(`Unhandled feature type "${loaded.type}"`);
			}
		}
	}

	async _pImportEntry_pFillItemArrayFeatures (allFeatures, importOpts, dataBuilderOpts) {
		const conInitial = Charactermancer_Util.getCurrentAbilityScores(this._actor).con;

		const existingFeatureChecker = new Charactermancer_Class_Util.ExistingFeatureChecker(this._actor);

		const {ImportListClassFeature} = await import("./ImportListClassFeature.js");
		const importListClassFeature = new ImportListClassFeature({actor: this._actor});
		await importListClassFeature.pInit();

		for (const feature of allFeatures) {
			const lowName = (feature.name || "").toLowerCase().trim();
			if (lowName === "ability score improvement") {
				const abilityScoreIncrease = new ImportListClass.AbilityScoreIncrease(this._actor, feature.level, dataBuilderOpts);
				abilityScoreIncrease.render(true);

				const feat = await abilityScoreIncrease.pWaitForUserInput(); // This will set "dataBuilderOpts.isCancelled" as appropriate
				if (feat) {
					const importListFeat = new ImportListFeat({actor: this._actor});
					await importListFeat.pImportEntry(
						feat,
						{
							isCharactermancer: importOpts.isCharactermancer,
						},
					);
				}
				continue;
			}

			if (feature.loadeds?.length) {
				feature.loadeds = feature.loadeds.filter(it => !it?._foundryIsIgnoreFeature);
				if (!feature.loadeds.length) continue;
			}

			const importSummary = await importListClassFeature.pImportEntry(
				feature,
				{
					isCharactermancer: importOpts.isCharactermancer,
					isPreLoadedFeature: true,
					featureEntriesPageFilter: this._pageFilter,
					featureEntriesPageFilterValues: importOpts.filterValues || this._pageFilter.filterBox.getValues(),
					existingFeatureChecker,
					spellcastingAbilityAbv: dataBuilderOpts.spellcastingAbility,
				},
			);
			const importMetasWrapped = this.constructor._getLevelledEmbeddedDocuments({importSummary, level: feature.level});

			if (feature.classFeature) {
				dataBuilderOpts.importedClassFeatureLevelledEmbeddedDocuments.push(...importMetasWrapped);
			} else if (feature.subclassFeature) {
				dataBuilderOpts.importedSubclassFeatureLevelledEmbeddedDocuments.push(...importMetasWrapped);
			} else {
				console.warn(...LGT, `Class/subclass feature had neither "classFeature" nor "subclassFeature" set! This should never occur!`);
			}
		}

		if (dataBuilderOpts.isCancelled) return;

		const conFinal = Charactermancer_Util.getCurrentAbilityScores(this._actor).con;
		return {conInitial, conFinal};
	}

	static _getLevelledEmbeddedDocuments ({importSummary, level}) {
		return importSummary.imported
			.filter(importMeta => importMeta.embeddedDocument)
			.map(importMeta => new UtilAdvancements.LevelledEmbeddedDocument_MinLevel1({
				embeddedDocument: importMeta.embeddedDocument,
				level: level,
			}));
	}

	_pImportEntry_handleConDifference ({conInitial, conFinal, dataBuilderOpts, isConPreApplied}) {
		if (conInitial == null || conFinal == null || conFinal === conInitial) return;

		const modOld = Parser.getAbilityModNumber(conInitial);
		const modNew = Parser.getAbilityModNumber(conFinal);
		const hpIncrease = (dataBuilderOpts.numLevelsPrev + (isConPreApplied ? 0 : dataBuilderOpts.numLevels)) * (modNew - modOld);

		const {value: curValue, max: curMax} = Charactermancer_Util.getBaseHp(this._actor);

		const hpCurNxt = curValue + hpIncrease;
		const hpMaxNxt = curMax + hpIncrease;

		MiscUtil.set(dataBuilderOpts.actorUpdate, "data", "attributes", "hp", "value", hpCurNxt);
		MiscUtil.set(dataBuilderOpts.actorUpdate, "data", "attributes", "hp", "max", hpMaxNxt);
	}

	async _pImportEntry_pAddUpdateClassItem (cls, sc, dataBuilderOpts) {
		for (const {dataBuilderProp, dataBuilderPropOut, pFnHasSideLoadedEffects, pFnGetSideLoadedEffectTuples} of [
			{
				dataBuilderProp: "classItemToCreate",
				dataBuilderPropOut: "classItem",
				pFnHasSideLoadedEffects: DataConverterClass.pHasClassSideLoadedEffects.bind(DataConverterClass),
				pFnGetSideLoadedEffectTuples: DataConverterClass.pGetClassItemEffectTuples.bind(DataConverterClass),
			},
			{
				dataBuilderProp: "subclassItemToCreate",
				dataBuilderPropOut: "subclassItem",
				pFnHasSideLoadedEffects: DataConverterClass.pHasSubclassSideLoadedEffects.bind(DataConverterClass),
				pFnGetSideLoadedEffectTuples: DataConverterClass.pGetSubclassItemEffectTuples.bind(DataConverterClass),
			},
		]) {
			if (!dataBuilderOpts[dataBuilderProp]) continue;

			const importedEmbeds = await UtilActors.pAddActorItems(this._actor, [dataBuilderOpts[dataBuilderProp]]);
			dataBuilderOpts[dataBuilderPropOut] = DataConverter.getImportedEmbed(importedEmbeds, dataBuilderOpts[dataBuilderProp])?.document;

			if (await pFnHasSideLoadedEffects({actor: this._actor, cls, sc}) && dataBuilderOpts[dataBuilderPropOut]) {
				const effectsSideTuples = await pFnGetSideLoadedEffectTuples({actor: this._actor, cls, sc, sheetItem: dataBuilderOpts[dataBuilderPropOut]});
				effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importClass", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));
				await UtilActors.pAddActorEffects(this._actor, effectsSideTuples.map(it => it.effect));
			}
		}

		const toPersistClassSubclassItemUpdates = [
			dataBuilderOpts.isPersistClassItemUpdate ? dataBuilderOpts.classItemUpdate : null,
			dataBuilderOpts.isPersistSubclassItemUpdate ? dataBuilderOpts.subclassItemUpdate : null,
		].filter(Boolean);

		if (toPersistClassSubclassItemUpdates.length) {
			await UtilDocuments.pUpdateEmbeddedDocuments(
				this._actor,
				toPersistClassSubclassItemUpdates,
				{
					propData: "items",
					ClsEmbed: Item,
				},
			);
		}
	}

	async _pImportEntry_pAddUnarmedStrike () {
		if (!Config.get(this._configGroup, "isAddUnarmedStrike")) return;

		const actorItems = MiscUtil.get(this._actor, "data", "items") || [];
		// Avoid adding if there's already e.g. "Unarmed Strike (Monk)"
		const isExisting = actorItems.some(it => it.name.split("(")[0].trim().toLowerCase() === ImportListClass._ITEM_NAME_UNARMED_STRIKE.toLowerCase());
		if (isExisting) return;

		const dataUnarmed = {
			name: "Unarmed Strike",
			source: SRC_PHB,
			page: 149,
			srd: true,
			type: "M",
			rarity: "none",
			weaponCategory: "simple",
			foundryData: {
				"equipped": true,
				"damage.parts": [
					[
						"1 + @mod",
						"bludgeoning",
					],
				],
				"ability": "str",
			},
		};

		const {ChooseImporter} = await import("./ChooseImporter.js");
		const importer = ChooseImporter.getImporter("item", this._actor);
		await importer.pInit();
		await importer.pImportEntry(dataUnarmed);
	}

	async _pImportEntry_pAddAdvancements (dataBuilderOpts) {
		if (dataBuilderOpts.importedClassFeatureLevelledEmbeddedDocuments.length) {
			await UtilAdvancements.pAddAdvancementLinks({
				actor: this._actor,
				parentEmbeddedDocument: dataBuilderOpts.classItem,
				childLevelledEmbeddedDocuments: dataBuilderOpts.importedClassFeatureLevelledEmbeddedDocuments,
			});
		}

		if (dataBuilderOpts.importedSubclassFeatureLevelledEmbeddedDocuments.length) {
			await UtilAdvancements.pAddAdvancementLinks({
				actor: this._actor,
				parentEmbeddedDocument: dataBuilderOpts.subclassItem,
				childLevelledEmbeddedDocuments: dataBuilderOpts.importedSubclassFeatureLevelledEmbeddedDocuments,
			});
		}
	}

	async _pImportEntry_pFinalise (dataBuilderOpts) {
		// Copy over equipment's actor currency update, as required
		if (dataBuilderOpts.formDataEquipment?.data?.currency) MiscUtil.set(dataBuilderOpts.actorUpdate, "data", "currency", dataBuilderOpts.formDataEquipment.data.currency);

		await this._pDoMergeAndApplyActorUpdate(dataBuilderOpts.actorUpdate);

		// Import equipment
		await Charactermancer_StartingEquipment.pImportEquipmentItemEntries(this._actor, dataBuilderOpts.formDataEquipment);

		// Apply generic active effects
		if (dataBuilderOpts.effects.length) {
			await UtilActors.pAddActorEffects(this._actor, dataBuilderOpts.effects);
		}

		// Apply spell points active effects, if required
		if (
			Config.get("importSpell", Config.getSpellPointsKey({actorType: this._actor?.type})) === ConfigConsts.C_SPELL_POINTS_MODE__ENABLED_AND_UNLIMITED_SLOTS
		) {
			if (!UtilActors.hasActorSpellPointSlotEffect({actor: this._actor})) {
				await UtilActors.pAddActorEffects(this._actor, UtilActors.getActorSpellPointsSlotsEffectData({actor: this._actor, sheetIem: dataBuilderOpts.classItem}));
			}
			Object.assign(
				dataBuilderOpts.postItemActorUpdate,
				foundry.utils.flattenObject(UtilActors.getActorSpellPointsSlotsUpdateData()),
			);
		}

		// Handle any final updates that need to be made after items have been added/updated
		Util.trimObject(dataBuilderOpts.postItemActorUpdate);
		if (Object.keys(dataBuilderOpts.postItemActorUpdate).length) await UtilDocuments.pUpdateDocument(this._actor, dataBuilderOpts.postItemActorUpdate);
	}

	/**
	 * Check if the user has only selected one high level while not having any class levels. If so, they probably meant
	 * to import all levels up to and including that level, not just e.g. level 7. Give them a chance to fix their
	 * mistake.
	 */
	async _pValidateUserLevelIndices (indices, dataBuilderOpts) {
		// If the user selected more than one index, don't question them
		if (indices.length > 1) return;

		// If the user selected 1st level, don't question them
		if (indices[0] === 0) return;

		// If the user already has class levels, don't question them
		const existingClassItems = this._actor.items.filter(it => it.type === "class");
		if (existingClassItems.length) return;

		const singleLevel = indices[0] + 1;
		const isSelectMissing = await InputUiUtil.pGetUserBoolean({
			title: "Import Lower Levels?",
			htmlDescription: `You have selected a single level to import (level ${singleLevel}). Would you like to import level${singleLevel === 2 ? "" : "s"} ${singleLevel === 2 ? "1" : `1-${singleLevel - 1}`} too?`,
			textYes: `Import Levels 1-${singleLevel}`,
			textNo: `Import Level ${singleLevel}`,
		});

		if (isSelectMissing == null) {
			dataBuilderOpts.isCancelled = true;
			return;
		}

		if (isSelectMissing) {
			const maxIndex = indices[0];
			for (let i = 0; i <= maxIndex; ++i) {
				indices[i] = i;
			}
		}
	}

	async _pImportEntry_pDoUpdateCharacter_pPopulateEquipment (cls, dataBuilderOpts) {
		if (!cls.startingEquipment) return;

		const startingEquipment = new Charactermancer_StartingEquipment({
			actor: this._actor,
			startingEquipment: cls.startingEquipment,
			appSubTitle: cls.name,
			equiSpecialSource: cls.source,
			equiSpecialPage: cls.page,
		});
		const formData = await startingEquipment.pWaitForUserInput();
		if (formData == null) return dataBuilderOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		dataBuilderOpts.formDataEquipment = formData;
	}

	static async pGetDefaultFilterValues () {
		const modalFilterClasses = new ModalFilterClasses({namespace: `${ModalFilterClasses.name}.default`});
		await modalFilterClasses.pPreloadHidden();
		return modalFilterClasses.pageFilter.filterBox.getValues();
	}

	_getAsTag (listItem) {
		const cls = this._content.class[listItem.data.ixClass];
		const sc = cls.subclasses[listItem.data.ixSubclass];

		const ptId = DataUtil.generic.packUid(cls, "class");
		return `@class[${ptId}]`;

		// TODO(Future) enable this if/when we make `@subclass` a real tag
		// if (!sc) {
		// 	const ptId = DataUtil.generic.packUid(cls, "class");
		// 	return `@class[${ptId}]`;
		// }
		//
		// const ptId = DataUtil.class.packUidSubclass(sc);
		// return `@subclass[${ptId}]`;
	}
}
ImportListClass._AE_LABEL_BASE_AC = "Base/Unarmored AC";
ImportListClass._ITEM_NAME_UNARMED_STRIKE = "Unarmed Strike";

ImportListClass.ImportEntryOpts = class extends ImportListCharacter.ImportEntryOpts {
	/**
	 * @param [opts]
	 * @param [opts.isClassImport]
	 * @param [opts.isCharactermancer]
	 */
	constructor (opts) {
		super(opts);
		opts = opts || {};

		this.isClassImport = !!opts.isClassImport;

		this.actorUpdate = {}; // Note that this is not the main actor update; this is extra data populated from class features
		this.postItemActorUpdate = {}; // An update that will be applied after all item updates have been made. Useful for fixing values after item updates have broken them.

		this.classItemToCreate = null;
		this.classItemUpdate = null;
		this.isPersistClassItemUpdate = false;

		this.subclassItemToCreate = null;
		this.subclassItemUpdate = null;
		this.isPersistSubclassItemUpdate = false;

		this.classItem = null;
		this.subclassItem = null;

		this.formDataEquipment = null;

		this.targetLevel = null; // Final level the actor will end up at
		this.numLevels = null; // Total number of levels we are to import
		this.numLevelsPrev = null; // Number of class levels the actor had before import
		this.isIncludesLevelOne = null;
		this.proficiencyImportMode = null;
		this.hpIncreaseMode = null;

		this.importedClassFeatureLevelledEmbeddedDocuments = [];
		this.importedSubclassFeatureLevelledEmbeddedDocuments = [];
	}
};

ImportListClass.Utils = class {
	static getDedupedData ({allContentMerged}) {
		allContentMerged = MiscUtil.copy(allContentMerged);

		Object.entries(allContentMerged)
			.forEach(([k, arr]) => {
				if (k !== "class") return;
				if (!(arr instanceof Array)) return;

				const out = [];
				const seen = new Set();
				arr.forEach(cls => {
					const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASSES](cls);

					// If it's an existing class, move any subclasses over to it
					if (seen.has(hash)) {
						if (cls.subclasses?.length) {
							const existingCls = out.find(it => UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASSES](it) === hash);
							(existingCls.subclasses = existingCls.subclasses || []).push(...cls.subclasses);
						}
						return;
					}

					seen.add(hash);
					out.push(cls);
				});

				allContentMerged[k] = out;
			});

		return allContentMerged;
	}

	static getBlocklistFilteredData ({dedupedAllContentMerged}) {
		dedupedAllContentMerged = {...dedupedAllContentMerged};
		Object.entries(dedupedAllContentMerged)
			.forEach(([k, arr]) => {
				if (k !== "class") return;
				if (!(arr instanceof Array)) return;

				const out = arr.filter(cls => {
					if (cls.source === VeCt.STR_GENERIC) return false;

					return !ExcludeUtil.isExcluded(
						UrlUtil.URL_TO_HASH_BUILDER["class"](cls),
						"class",
						cls.source,
						{isNoCount: true},
					);
				});

				out.forEach(cls => {
					if (!cls.subclasses) return;

					cls.subclasses = cls.subclasses.filter(sc => {
						if (sc.source === VeCt.STR_GENERIC) return false;

						return !ExcludeUtil.isExcluded(
							UrlUtil.URL_TO_HASH_BUILDER["subclass"](sc),
							"subclass",
							sc.source,
							{isNoCount: true},
						);
					});
				});

				dedupedAllContentMerged[k] = out;
			});
		return dedupedAllContentMerged;
	}
};

ImportListClass.AbilityScoreIncrease = class extends Application {
	constructor (actor, level, dataBuilderOpts) {
		super({
			title: `Ability Score Improvement\u2014Level ${level}`,
			template: `${SharedConsts.MODULE_LOCATION}/template/ImportListClassAbilityScoreIncrease.hbs`,
			width: 640,
			resizable: true,
		});

		this._dataBuilderOpts = dataBuilderOpts;

		this._resolve = null;
		this._reject = null;
		this._pUserInput = new Promise((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
		});

		this._comp = new ImportListClass.AbilityScoreIncrease.Component(
			actor,
			dataBuilderOpts,
			this.close.bind(this),
		);
	}

	activateListeners ($html) {
		this._comp.render($html);
	}

	async close () {
		await super.close();
		if (!this._comp.isDataEntered) this._dataBuilderOpts.isCancelled = true;
		this._resolve(this._comp.getFeat());
	}

	pWaitForUserInput () { return this._pUserInput; }
};
ImportListClass.AbilityScoreIncrease.Component = class extends BaseComponent {
	constructor (actor, dataBuilderOpts, fnClose) {
		super();
		this._actor = actor;
		this._dataBuilderOpts = dataBuilderOpts;
		this._fnClose = fnClose;

		this._isDataEntered = false;

		Object.assign(
			this.__state,
			Charactermancer_Util.getBaseAbilityScores(this._actor),
		);
	}

	get isDataEntered () { return this._isDataEntered; }

	render ($html) {
		const $btnShowTabAsi = $(`<button class="btn btn-default w-50 btn-5et">Ability Score Improvement</button>`)
			.click(() => this._state.mode = "ability");
		const $btnShowTabFeat = $(`<button class="btn btn-default w-50 btn-5et">Feat</button>`)
			.click(() => this._state.mode = "feat");

		const $wrpTabAsi = $(`<div class="ve-flex-col w-100 h-100"></div>`);
		const $wrpTabFeat = $(`<div class="ve-flex-col w-100 h-100"></div>`);

		const hkMode = () => {
			const isAbilityMode = this._state.mode === "ability";
			$btnShowTabAsi.toggleClass("active", isAbilityMode);
			$btnShowTabFeat.toggleClass("active", !isAbilityMode);
			$wrpTabAsi.toggleVe(isAbilityMode);
			$wrpTabFeat.toggleVe(!isAbilityMode);
		};
		hkMode();
		this._addHookBase("mode", hkMode);

		this._render_ability($wrpTabAsi);
		this._render_feat($wrpTabFeat);

		$$($html)`<div class="ve-flex-col w-100 h-100">
			<div class="ve-flex no-shrink btn-group mb-1">${$btnShowTabAsi}${$btnShowTabFeat}</div>
			${$wrpTabAsi}
			${$wrpTabFeat}
		</div>`;
	}

	_render_ability ($wrpTabAsi) {
		const rowMetas = [
			"str",
			"dex",
			"con",
			"int",
			"wis",
			"cha",
		].map(abil => {
			const $dispCur = $(`<div class="col-2 text-center"></div>`);
			const $dispCurMod = $(`<div class="col-2 text-center"></div>`);
			const hkBase = () => {
				$dispCur.text(this._state[abil]);
				$dispCurMod.text(Parser.getAbilityModifier(this._state[abil]));
			};
			this._addHookBase(abil, hkBase);
			hkBase();

			const propBonus = `${abil}Bonus`;
			const {$wrp: $wrpBonus, $ipt: $iptBonus} = ComponentUiUtil.$getIptNumber(
				this,
				propBonus,
				0,
				{
					min: 0,
					fallbackOnNaN: 0,
					html: `<input type="text" class="text-center" placeholder="0">`,
					asMeta: true,
					decorationRight: "ticker",
					decorationLeft: "spacer",
				},
			);
			$iptBonus.click(() => $iptBonus.select());

			const $dispTotal = $(`<div class="col-2 text-center"></div>`);
			const $dispTotalMod = $(`<div class="col-2 text-center"></div>`);
			const hkBonus = () => {
				const scoreTotal = this._state[abil] + this._state[propBonus];
				$dispTotal.text(scoreTotal);
				$dispTotalMod.text(Parser.getAbilityModifier(scoreTotal));
				$dispTotal.toggleClass("veapp__msg-error", scoreTotal > 20).title(scoreTotal > 20 ? `You can't increase an ability score above 20 using this feature.` : "");
			};
			this._addHookBase(propBonus, hkBonus);
			hkBonus();

			const $row = $$`<div class="ve-flex w-100 my-1">
				<div class="col-1 text-right bold">${abil.toUpperCase()}</div>
				${$dispCur}
				${$dispCurMod}
				<div class="col-2">${$wrpBonus}</div>
				<div class="col-1 text-center">=</div>
				${$dispTotal}
				${$dispTotalMod}
			</div>`;

			return {
				$row,
				$iptBonus,
			};
		});

		const $dispRemain = $(`<div class="text-center" title="Remaining"></div>`);

		const hkBonuses = () => {
			const totalBonuses = [
				"strBonus",
				"dexBonus",
				"conBonus",
				"intBonus",
				"wisBonus",
				"chaBonus",
			].map(prop => this._state[prop]).reduce((a, b) => a + b, 0);

			const isInvalid = totalBonuses > 2;

			$dispRemain.text(`Remaining: ${2 - totalBonuses}`).toggleClass("veapp__msg-error", isInvalid);
			rowMetas.forEach(it => it.$iptBonus.toggleClass("form-control--error", isInvalid));
		};
		[
			"strBonus",
			"dexBonus",
			"conBonus",
			"intBonus",
			"wisBonus",
			"chaBonus",
		].forEach(prop => this._addHookBase(prop, hkBonuses));
		hkBonuses();

		const $btnAcceptAsi = $(`<button class="btn btn-primary mr-2">Confirm</button>`)
			.click(async () => {
				const total = [
					this._state.strBonus,
					this._state.dexBonus,
					this._state.conBonus,
					this._state.intBonus,
					this._state.wisBonus,
					this._state.chaBonus,
				].reduce((a, b) => a + b, 0);
				if (total !== 2) return ui.notifications.error(`Please enter a combination of ability score changes which adds up to two!`);

				await this._pDoResolve(true);
			});

		const $btnSkipAsi = $(`<button class="btn btn-default mr-3">Skip</button>`)
			.click(() => this._pDoResolve(VeCt.SYM_UI_SKIP));

		$$($wrpTabAsi)`
		<div class="ve-flex w-100 my-1 bold">
			<div class="text-center col-1"></div>
			<div class="text-center col-2">Current</div>
			<div class="text-center col-2 ve-muted">Mod</div>
			<div class="text-center col-2 text-center">${$dispRemain}</div>
			<div class="text-center col-1"></div>
			<div class="text-center col-2">Result</div>
			<div class="text-center col-2 ve-muted">Mod</div>
		</div>
		<div class="ve-flex-col w-100 h-100">
			${rowMetas.map(it => it.$row)}
		</div>
		<div class="ve-flex-v-center ve-flex-h-right w-100">${$btnAcceptAsi}${$btnSkipAsi}</div>
		`;
	}

	_render_feat ($wrpTabFeat) {
		const $btnSelectFeat = $(`<button class="btn btn-default btn-5et w-100 mr-2">Choose Feat</button>`)
			.click(async () => {
				const featData = await ImportListFeat.UserChoose.pGetUserChoice(
					{
						id: "feats-classAbilityScoreIncrease",
						name: "Feats",
						singleName: "Feat",

						wizardTitleWindow: "Select Source",
						wizardTitlePanel3: "Configure and Open List",
						wizardTitleButtonOpenImporter: "Open List",
					},
					"classAbilityScoreIncrease",
				);
				if (!featData) return;

				const {page, source, hash} = MiscUtil.get(featData, "flags", SharedConsts.MODULE_NAME_FAKE) || {};
				if (!page || !source || !hash) return;

				this._state.feat = await Renderer.hover.pCacheAndGet(page, source, hash);
			});

		const $dispFeat = $(`<div></div>`);
		const hkFeat = () => {
			$dispFeat.empty();

			if (!this._state.feat) return;
			$dispFeat.html(`<hr class="hr-1"><h3 class="mb-2 mt-0">Selected: ${this._state.feat.name}</h3>`);

			$dispFeat.empty();
			$$($dispFeat)`<hr class="hr-1">
			${Vetools.withUnpatchedDiceRendering(() => Renderer.hover.$getHoverContent_stats(UrlUtil.PG_FEATS, MiscUtil.copy(this._state.feat)))}`;
		};
		hkFeat();
		this._addHookBase("feat", hkFeat);

		const $btnAcceptFeat = $(`<button class="btn btn-primary btn-5et">Confirm</button>`)
			.click(async () => {
				if (!this._state.feat) return ui.notifications.error(`Please select a feat!`);
				await this._pDoResolve(true);
			});

		const $btnSkipFeat = $(`<button class="btn btn-default btn-5et">Skip</button>`)
			.click(() => this._pDoResolve(VeCt.SYM_UI_SKIP));

		$$($wrpTabFeat)`
		<div class="ve-flex-col h-100">
			<div class="ve-flex-v-center mb-1">
				${$btnSelectFeat}
				<div class="ve-flex-v-center btn-group">${$btnAcceptFeat}${$btnSkipFeat}</div>
			</div>
			${$dispFeat}
		</div>
		`;
	}

	async _pDoResolve (isOutput) {
		if (!isOutput) return this._fnClose();

		if (isOutput === VeCt.SYM_UI_SKIP) {
			this._isDataEntered = true;
			return this._fnClose();
		}

		const actUpdate = this._getActorUpdate();
		if (actUpdate) {
			this._isDataEntered = true;
			await UtilDocuments.pUpdateDocument(this._actor, actUpdate);
		}

		if (this.getFeat()) {
			this._isDataEntered = true;
		}

		this._fnClose();
	}

	_getActorUpdate () {
		if (this._state.mode !== "ability") return null;
		return {
			data: {
				abilities: {
					str: {value: this._state.str + this._state.strBonus},
					dex: {value: this._state.dex + this._state.dexBonus},
					con: {value: this._state.con + this._state.conBonus},
					int: {value: this._state.int + this._state.intBonus},
					wis: {value: this._state.wis + this._state.wisBonus},
					cha: {value: this._state.cha + this._state.chaBonus},
				},
			},
		};
	}

	getFeat () {
		if (this._state.mode !== "feat") return null;
		return MiscUtil.copy(this._state.feat);
	}

	_getDefaultState () {
		return {
			mode: "ability",

			str: 0,
			dex: 0,
			con: 0,
			int: 0,
			wis: 0,
			cha: 0,
			strBonus: 0,
			dexBonus: 0,
			conBonus: 0,
			intBonus: 0,
			wisBonus: 0,
			chaBonus: 0,

			feat: null,
		};
	}
};

ImportListClass.SheetLevelUpButtonAdapter = class {
	static init () {
		Hooks.on("renderActorSheet", (app, $html, data) => {
			this._pHandleRenderSheet(app, $html, data).then(null);
		});
	}

	static async _pHandleRenderSheet (app, $html, data) {
		if (!Config.get("importClass", "isAddLevelUpButton")) return;
		if (!data.owner) return;
		if (!data.isCharacter) return;

		const sheetAdapter = ImportListClass.SheetLevelUpButtonAdapter._SUPPORTED_SHEETS[app.constructor.name];

		if (!sheetAdapter) return;

		const minRole = Config.get("import", "minimumRole");
		if (game.user.role < minRole) return;

		const existingClassItems = app.actor.items.filter(it => it.type === "class");
		if (!existingClassItems.length) return;
		const existingSubclassItems = app.actor.items.filter(it => it.type === "subclass");

		const existingClassSubclassItemTuples = Charactermancer_Class_Util.getClassSubclassItemTuples({classItems: existingClassItems, subclassItems: existingSubclassItems});

		const availableClassesMetas = await existingClassSubclassItemTuples.pSerialAwaitMap(tuple => this._pGetAvailableClassSubclass(tuple));

		const $btnLevelUp = !availableClassesMetas.some(it => !it.errors) ? this._$getBtnLevelUp_errors({availableClassesMetas}) : this._$getBtnLevelUp({app, availableClassesMetas});

		sheetAdapter.addButton(app.form, $btnLevelUp);
	}

	static _$getBtn () {
		return $(`<button class="btn btn-5et btn-xxs ml-1 imp-cls__btn-sheet-level-up ve-flex-vh-center" type="button"><i class="fas fa-fw fa-arrow-alt-circle-up mx-auto pl-1p"></i></button>`);
	}

	static _$getBtnLevelUp_errors ({availableClassesMetas}) {
		const ptErrors = availableClassesMetas.map(it => it.errors).filter(Boolean).flat().join("; ");

		return this._$getBtn()
			.prop("disabled", true)
			.title(`Cannot Level Up\u2014no known classes found.${availableClassesMetas.length ? ` Errors were: ${ptErrors}.` : ""}`);
	}

	static _$getBtnLevelUp ({app, availableClassesMetas}) {
		const isGlowing = !UtilGameSettings.getSafe(game.system.id, "disableExperienceTracking") && UtilActors.isLevelUp(app.actor);

		return this._$getBtn()
			.toggleClass("btn-pulse", !!isGlowing)
			.title(`Level Up`)
			.click(async () => {
				const {$modalInner, doClose, doAutoResize: doAutoResizeModal} = await UtilApplications.pGetShowApplicationModal({
					title: `Level Up`,
					isMaxWidth640p: true,
					isMinHeight0: true,
				});

				const $rows = availableClassesMetas.map(({errors, existingClassItem, existingSubclassItem, cls, sc, filterValues}) => {
					if (errors) {
						return $$`<div class="ve-flex-col stripe-even py-1 ve-muted">
							<p>${(existingClassItem.name || "").qq()}${existingSubclassItem?.name ? ` (${existingSubclassItem.name.qq()})` : ""} was not available for level up:</p>${errors.map(it => `<p><i>${it.qq()}</i></p>`).join("")}
						</div>`;
					}

					const $btnChoose = $(`<button class="btn btn-5et btn-sm no-wrap" title="Level up this class"><i class="fas fa-fw fa-arrow-alt-circle-up"></i> Level ${existingClassItem.data.data.levels} &#8594; Level ${existingClassItem.data.data.levels + 1}</button>`)
						.click(async () => {
							doClose();

							const targetLevel = Number(existingClassItem.data.data.levels) + 1;

							if (!sc) {
								const minSubclassLevel = Math.min(...cls.classFeatures
									.filter(it => it.gainSubclassFeature && it.classFeature)
									.map(it => DataUtil.class.unpackUidClassFeature(it.classFeature).level));
								if (targetLevel >= minSubclassLevel) {
									const isSelectSubclass = await InputUiUtil.pGetUserBoolean({
										title: `Choose Subclass?`,
										htmlDescription: `Would you like to choose a subclass to include in the level up?`,
										textYes: "Yes",
										textNo: "No",
									});

									if (isSelectSubclass) {
										const modalFilterClasses = new ModalFilterClasses({namespace: `${ModalFilterClasses.name}.selectSubclass`});
										const selected = await modalFilterClasses.pGetUserSelection({ // Returns "raw" data
											selectedClass: cls,
											isClassDisabled: true,
										});
										if (selected) sc = selected.subclass;
									}
								}
							}

							const importList = new ImportListClass({actor: app.actor});
							await importList.pInit();

							cls = MiscUtil.copy(cls);
							delete cls.subclasses; // (Ensure no legacy subclass junk goes through)

							const importableClassData = await ImportListClass.pPostLoad(
								{class: [cls], subclass: [sc].filter(Boolean)},
								{actor: app.actor},
							);
							await importList.pImportClass(importableClassData.class[0], {levels: [targetLevel], filterValues});

							ui.notifications.info(`Level up complete!`);
						});

					return $$`<div class="ve-flex-v-center stripe-even py-1">
						<div class="w-100 mr-2">${existingClassItem.name}${sc && existingSubclassItem ? ` (${existingSubclassItem.name})` : ""}</div>
						<div>${$btnChoose}</div>
					</div>`;
				});

				const $btnAddNewLevel = $(`<button class="btn btn-5et btn-sm no-wrap"><i class="fas fa-fw fa-plus-circle"></i> Add New Class (Multiclass)</button>`)
					.click(async () => {
						doClose();

						const importListClassSources = await (new ImportListClass()).pGetSources();
						const appSourceSelector = new AppSourceSelectorMulti({
							title: `Select Class Sources`,
							filterNamespace: `ImportListClass_SheetLevelUpButtonAdapter_filter`,
							savedSelectionKey: `ImportListClass_SheetLevelUpButtonAdapter_savedSelection`,
							sourcesToDisplay: importListClassSources,
							fnGetDedupedData: ImportListClass.Utils.getDedupedData.bind(ImportListClass.Utils),
							fnGetBlocklistFilteredData: ImportListClass.Utils.getBlocklistFilteredData.bind(ImportListClass.Utils),
						});

						const allData = await appSourceSelector.pWaitForUserInput();
						if (allData == null) return;

						const modalFilterClasses = new ModalFilterClassesFvtt({
							namespace: `${ModalFilterClasses.name}.selectSubclass`,
							allData: allData.class,
						});
						const selected = await modalFilterClasses.pGetUserSelection({});
						if (!selected?.class) return;

						const importList = new ImportListClass({actor: app.actor});
						await importList.pInit();

						const clsRaw = await Renderer.hover.pCacheAndGet("raw_class", selected.class.source, UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASSES]({name: selected.class.name, source: selected.class.source}), {isCopy: true});
						const scRaw = selected.subclass ? await Renderer.hover.pCacheAndGet("raw_subclass", selected.subclass.source, UrlUtil.URL_TO_HASH_BUILDER["subclass"]({name: selected.subclass.name, shortName: selected.subclass.shortName, source: selected.subclass.source, className: selected.subclass.className, classSource: selected.subclass.classSource}), {isCopy: true}) : null;

						delete clsRaw.subclasses; // (Ensure no legacy subclass junk goes through)

						const importableClassData = await ImportListClass.pPostLoad(
							{class: [clsRaw], subclass: [scRaw].filter(Boolean)},
							{actor: app.actor},
						);

						const clsOut = importableClassData.class[0];
						clsOut._foundryStartingProficiencyMode = Charactermancer_Class_ProficiencyImportModeSelect.MODE_MULTICLASS;

						await importList.pImportClass(importableClassData.class[0], {levels: [1], filterValues: (await ImportListClass.pGetDefaultFilterValues())});

						ui.notifications.info(`Level up complete!`);
					});

				$$`<div class="ve-flex-col h-100 w-100 mt-2">
						<div class="mb-1">Your current classes are listed below.</div>
						<div class="mb-1">If you level a class which does not have a subclass, and is eligible for one, you will be prompted to choose a subclass.</div>
						<div>${Renderer.get().render(`Alternatively, you may gain a level in a new class, if your DM allows {@variantrule multiclassing|phb}.`)}</div>
						<hr class="hr-2">
						<div class="w-100">
							${$rows}
						</div>
						<hr class="hr-1 hr--dotted">
						<div class="mt-1 mb-2 ve-flex-h-right">${$btnAddNewLevel}</div>
					</div>`.appendTo($modalInner);

				doAutoResizeModal();
			});
	}

	static async _pCacheClassData () {
		ImportListClass.SheetLevelUpButtonAdapter._P_LOADING_CLASS_DATA = ImportListClass.SheetLevelUpButtonAdapter._P_LOADING_CLASS_DATA || (async () => {
			ImportListClass.SheetLevelUpButtonAdapter._CACHE_CLASS_DATA = await DataUtil.class.loadRawJSON();
		})();
		await ImportListClass.SheetLevelUpButtonAdapter._P_LOADING_CLASS_DATA;
	}

	static async _pGetAvailableClassSubclass (itemTuple) {
		const {classItem: existingClassItem, subclassItem: existingSubclassItem} = itemTuple;

		const levelNumber = Number(existingClassItem.data.data.levels);
		if (isNaN(levelNumber)) return {existingClassItem, existingSubclassItem, errors: [`Class item "${existingClassItem.name}" (${existingClassItem.id}) did not have a valid "levels" value!`]};

		const flags = existingClassItem?.data?.flags?.[SharedConsts.MODULE_NAME_FAKE];

		const filterValues = await this._pGetFilterValues(flags);

		const isClassDefinedInFlags = flags && flags.page && flags.source && flags.hash;
		if (!isClassDefinedInFlags) return this._pGetAvailableClassSubclassFromName(itemTuple, filterValues);

		const cls = await Renderer.hover.pCacheAndGet("raw_class", flags.source, flags.hash, {isCopy: true});
		const sc = flags.sourceSubclass && flags.hashSubclass
			? (await Renderer.hover.pCacheAndGet("raw_subclass", flags.sourceSubclass, flags.hashSubclass, {isCopy: true}))
			: null;

		if (flags.sourceSubclass && flags.hashSubclass && !sc) return {existingClassItem, existingSubclassItem, errors: [`Failed to find and/or load subclass "${flags.hashSubclass}" (${flags.sourceSubclass}) from flags`]};

		if (cls) return {existingClassItem, existingSubclassItem, cls, sc, filterValues};

		if (isClassDefinedInFlags) return {existingClassItem, existingSubclassItem, errors: [`Failed to find and/or load class "${flags.hash}" (${flags.source}) from flags`]};

		return this._pGetAvailableClassSubclassFromName(existingClassItem, filterValues);
	}

	static async _pGetAvailableClassSubclassFromName (itemTuple, filterValues) {
		const {classItem: existingClassItem, subclassItem: existingSubclassItem} = itemTuple;

		await this._pCacheClassData();

		const cls = Charactermancer_Class_Util.getClassFromExistingClassItem(existingClassItem, ImportListClass.SheetLevelUpButtonAdapter._CACHE_CLASS_DATA.class);

		if (!cls) return {existingClassItem, errors: [`Failed to find and/or load class "${existingClassItem.name}" (${UtilDataConverter.getItemSource(existingClassItem).source}) by name`]};

		const sc = existingSubclassItem
			? Charactermancer_Class_Util.getSubclassFromExistingSubclassItem(existingSubclassItem, cls, ImportListClass.SheetLevelUpButtonAdapter._CACHE_CLASS_DATA.subclass)
			: null;

		if (existingSubclassItem && sc == null) return {existingClassItem, errors: [`Failed to find and/or load subclass "${existingSubclassItem.name}" by name`]};

		return {existingClassItem, existingSubclassItem, cls, sc, filterValues};
	}

	static async _pGetFilterValues (flags) {
		if (flags?.filterValues) return flags.filterValues;

		// If there are no filter values present in the flags, we'll have to improvise--silently load up a class filter
		//   selection modal and use it as a surrogate.
		return ImportListClass.pGetDefaultFilterValues();
	}

	static registerSupportedSheet (sheetName, ClassAdapter) {
		ImportListClass.SheetLevelUpButtonAdapter._SUPPORTED_SHEETS[sheetName] = ClassAdapter;
	}
};
ImportListClass.SheetLevelUpButtonAdapter._P_LOADING_CLASS_DATA = null;
ImportListClass.SheetLevelUpButtonAdapter._CACHE_CLASS_DATA = null;

ImportListClass.SheetLevelUpButtonAdapter._SUPPORTED_SHEETS = {};

ImportListClass.SheetLevelUpButtonAdapter.SheetAdapter = class {
	static addButton (form, $btn) { throw new Error(`Unimplemented!`); }

	/** Handle the case where the sheet can be entirely re-rendered. */
	static _removeExistingButton (tgt) { $(tgt).find(`.imp-cls__btn-sheet-level-up`).remove(); }
};

ImportListClass.SheetLevelUpButtonAdapter.SheetAdapterActorSheet5eCharacter = class extends ImportListClass.SheetLevelUpButtonAdapter.SheetAdapter {
	static addButton (form, $btn) {
		if (!this._INDEX_PATH) {
			const $ele = $(form).find(`.charlevel`);
			this._INDEX_PATH = ElementUtil.getIndexPathToParent(form, $ele[0]);
		}

		const tgt = ElementUtil.getChildByIndexPath(form, this._INDEX_PATH);
		$btn.css({fontSize: 10.5});
		this._removeExistingButton(tgt);
		$(tgt).append($btn);
	}
};
ImportListClass.SheetLevelUpButtonAdapter.SheetAdapterActorSheet5eCharacter._INDEX_PATH = null;
ImportListClass.SheetLevelUpButtonAdapter.registerSupportedSheet(
	"ActorSheet5eCharacter",
	ImportListClass.SheetLevelUpButtonAdapter.SheetAdapterActorSheet5eCharacter,
);

ImportListClass.SheetLevelUpButtonAdapter.Tidy5eSheet = class extends ImportListClass.SheetLevelUpButtonAdapter.SheetAdapter {
	static addButton (form, $btn) {
		if (!this._INDEX_PATH) {
			const $ele = $(form).find(`.level-information`);
			this._INDEX_PATH = ElementUtil.getIndexPathToParent(form, $ele[0]);
		}

		const tgt = ElementUtil.getChildByIndexPath(form, this._INDEX_PATH);
		$btn.addClass("ml-2 ve-self-flex-center b-0");
		this._removeExistingButton(tgt);
		$(tgt).prepend($btn);
	}
};
ImportListClass.SheetLevelUpButtonAdapter.Tidy5eSheet._INDEX_PATH = null;
ImportListClass.SheetLevelUpButtonAdapter.registerSupportedSheet(
	"Tidy5eSheet",
	ImportListClass.SheetLevelUpButtonAdapter.Tidy5eSheet,
);

export {ImportListClass};
