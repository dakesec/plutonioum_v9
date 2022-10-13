import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {UtilList2} from "./UtilList2.js";
import {UtilDataSource} from "./UtilDataSource.js";
import {DataConverterCreatureFeature} from "./DataConverterCreatureFeature.js";
import {ImportListCharacter} from "./ImportListCharacter.js";
import {LGT} from "./Util.js";
import {ImportedDocument, ImportSummary} from "./ImportList.js";
import {UtilApplications} from "./UtilApplications.js";

class PageFilterCreatureFeature extends PageFilter {
	constructor () {
		super();
		this._typeFilter = new Filter({
			header: "Type",
			labelDisplayFn: it => Parser.getPropDisplayName(it.replace(/^monster/, "").lowercaseFirst()),
		});
		this._crFilter = new RangeFilter({
			header: "Challenge Rating",
			isLabelled: true,
			labelSortFn: SortUtil.ascSortCr,
			labels: [...Parser.CRS, "Unknown", "\u2014"],
			labelDisplayFn: it => it === "\u2014" ? "None" : it,
		});
		this._miscFilter = new Filter({
			header: "Miscellaneous",
			items: ["SRD", "Basic Rules"],
			isMiscFilter: true,
		});
	}

	static mutateForFilters (ent) {
		ent._fMisc = ent.srd ? ["SRD"] : [];
		if (ent.basicRules) ent._fMisc.push("Basic Rules");
	}

	addToFilters (it, isExcluded) {
		if (isExcluded) return;

		this._sourceFilter.addItem(it.source);
		this._crFilter.addItem(it._monsterFilterCr);
		this._typeFilter.addItem(it.__prop);
		this._miscFilter.addItem(it._fMisc);
	}

	async _pPopulateBoxOptions (opts) {
		opts.filters = [
			this._sourceFilter,
			this._typeFilter,
			this._crFilter,
			this._miscFilter,
		];
	}

	toDisplay (values, it) {
		return this._filterBox.toDisplay(
			values,
			it.source,
			it.__prop,
			it._monsterFilterCr,
			it._fMisc,
		);
	}
}

class ImportListCreatureFeature extends ImportListCharacter {
	static get ID () { return "creature-features"; }
	static get DISPLAY_NAME_TYPE_PLURAL () { return "Creature Features"; }

	static _ = this.registerImpl(this);

	constructor (externalData = {}) {
		super(
			{title: "Import Creature Features"},
			externalData,
			{
				props: Renderer.monster.CHILD_PROPS_EXTENDED.map(it => `monster${it.uppercaseFirst()}`),
				dirsHomebrew: ["creature"],
				titleSearch: "creature features",
				sidebarTab: "items",
				gameProp: "items",
				defaultFolderPath: ["Creature Features"],
				pageFilter: new PageFilterCreatureFeature(),
				isPreviewable: true,
				isDedupable: true,
				configGroup: "importCreatureFeature",
			},
		);
	}

	async pInit () {
		await super.pInit();
		await DataUtil.monster.pPreloadMeta();
	}

	_pPostLoad_getFeaturesFromSingleSourceCreatures (src, data) {
		data = {...data};
		data.monster = data.monster.filter(mon => mon.source === src);

		return this._pPostLoad_getFeaturesFromCreatures(data);
	}

	_pPostLoad_getFeaturesFromCreatures (data) {
		const out = {};

		for (const mon of data.monster) {
			Renderer.monster.initParsed(mon);

			const legendaryMeta = DataUtil.monster.getMetaGroup(mon);

			Renderer.monster.CHILD_PROPS_EXTENDED.forEach(prop => {
				// TODO(Future) support spellcasting
				if (prop === "spellcasting") return;

				const outProp = `monster${prop.uppercaseFirst()}`;

				(mon[prop] || legendaryMeta?.[prop] || [])
					.filter(ent => ent.name && ent.entries)
					.forEach(ent => {
						out[outProp] = out[outProp] || [];
						out[outProp].push(DataConverterCreatureFeature.getFauxCreatureFeature(mon, ent, `monster${prop.uppercaseFirst()}`));
					});
			});
		}

		return out;
	}

	async _pGetSources () {
		const creatureIndex = await Vetools.pGetCreatureIndex();

		const argsShared = {pPostLoad: (data) => this._pPostLoad_getFeaturesFromCreatures(data)};

		return [
			new UtilDataSource.DataSourceSpecial(
				Config.get("ui", "isStreamerMode") ? "SRD" : "5etools",
				Vetools.pGetAllCreatures.bind(Vetools),
				{
					...argsShared,
					cacheKey: "5etools-creature-features",
					filterTypes: [UtilDataSource.SOURCE_TYP_OFFICIAL_ALL],
					isDefault: true,
				},
			),
			new UtilDataSource.DataSourceUrl(
				"Custom URL",
				"",
				{
					...argsShared,
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			new UtilDataSource.DataSourceFile(
				"Upload File",
				{
					...argsShared,
					filterTypes: [UtilDataSource.SOURCE_TYP_CUSTOM],
				},
			),
			...Object.entries(creatureIndex).map(([src, filename]) => new UtilDataSource.DataSourceUrl(
				Parser.sourceJsonToFull(src),
				Vetools.getCreatureUrl(filename),
				{
					...argsShared,
					source: src,
					pPostLoad: (data) => this._pPostLoad_getFeaturesFromSingleSourceCreatures(src, data),
					filterTypes: SourceUtil.isNonstandardSource(src) ? [UtilDataSource.SOURCE_TYP_ARCANA] : [UtilDataSource.SOURCE_TYP_OFFICIAL_SINGLE],
				},
			)),
			...(await this._pGetSourcesHomebrew()),
		];
	}

	getData () {
		return {
			...super.getData(),
			cols: [
				{
					name: "Name",
					width: 4,
					field: "name",
				},
				{
					name: "Type",
					width: 2,
					field: "type",
					rowClassName: "text-center",
				},
				{
					name: "Creature",
					width: 3,
					field: "monsterName",
				},
				{
					name: "CR",
					width: 1,
					field: "cr",
					rowClassName: "text-center",
				},
				{
					name: "Source",
					width: 1,
					field: "source",
					titleProp: "sourceLong",
					displayProp: "sourceShort",
					classNameProp: "sourceClassName",
					styleProp: "sourceStyle",
					rowClassName: "text-center",
				},
			],
			rows: this._content.map((it, ix) => {
				this._pageFilter.constructor.mutateForFilters(it);

				it._vCr = it._monsterParsedCr || "\u2014";
				it._vType = Parser.getPropDisplayName(it.__prop.replace(/^monster/, "").lowercaseFirst());

				return {
					name: it.name,
					type: it._vType,
					cr: it._vCr,
					monsterName: it.monsterName,
					source: it.source,
					sourceShort: Parser.sourceJsonToAbv(it.source),
					sourceLong: Parser.sourceJsonToFull(it.source),
					sourceClassName: Parser.sourceJsonToColor(it.source),
					sourceStyle: BrewUtil2.sourceJsonToStylePart(it.source),
					__prop: it.__prop,
					ix,
				};
			}),
		};
	}

	_renderInner_absorbListItems () {
		this._list.doAbsorbItems(
			this._content,
			{
				fnGetName: it => it.name,
				// values used for sorting/search
				fnGetValues: it => ({
					source: it.source,
					type: it._vType,
					cr: it._vCr,
					monsterName: it.monsterName,
					hash: UrlUtil.URL_TO_HASH_BUILDER[it.__prop](it),
				}),
				fnGetData: UtilList2.absorbFnGetData,
				fnBindListeners: it => this._isRadio
					? UtilList2.absorbFnBindListenersRadio(this._list, it)
					: UtilList2.absorbFnBindListeners(this._list, it),
			},
		);
	}

	/**
	 * @param ent
	 * @param importOpts Options object.
	 * @param [importOpts.isTemp] if the item should be temporary, and displayed.
	 * @param [importOpts.filterValues] Saved filter values to be used instead of our own.
	 */
	async _pImportEntry (ent, importOpts) {
		importOpts = importOpts || {};

		console.log(...LGT, `Importing creature feature "${ent.name}" (from "${Parser.sourceJsonToAbv(ent.source)}")`);

		if (importOpts.isTemp) return this._pImportEntry_pImportToDirectoryGeneric(ent, importOpts);
		if (this._actor) return this._pImportEntry_pImportToActor(ent, importOpts);
		return this._pImportEntry_pImportToDirectoryGeneric(ent, importOpts);
	}

	async _pImportEntry_pImportToActor (ent, importOpts) {
		const dataBuilderOpts = new ImportListCharacter.ImportEntryOpts({});

		await this._pImportEntry_pFillItems(ent, dataBuilderOpts);
		if (dataBuilderOpts.isCancelled) return ImportSummary.cancelled();

		if (this._actor.isToken) this._actor.sheet.render();

		return new ImportSummary({
			status: UtilApplications.TASK_EXIT_COMPLETE,
			imported: [
				new ImportedDocument({
					name: ent.name,
					actor: this._actor,
				}),
			],
		});
	}

	async _pImportEntry_pFillItems () {
		// TODO(v10) once we drop support for v9, do a big refactor such that monster features
		//   imported via this path share the same implementation as the creature importer. To do this, we want to:
		//   - refactor all action/etc. building from `ImportListCreature` to `DataConverterCreatureFeature`
		//     - do the same for the relevant bits of objects/etc., and make e.g. `DataConverterObjectFeature`/etc.
	}

	_pImportEntry_pImportToDirectoryGeneric_pGetImportableData (it, getItemOpts) {
		return DataConverterCreatureFeature.pGetCreatureFeatureItem(it, getItemOpts);
	}
}

export {ImportListCreatureFeature};
