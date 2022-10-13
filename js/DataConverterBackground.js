import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";

class DataConverterBackground extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryBackground",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "background",
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/farmer.svg`;

	static _getCompendiumAliases (ent) {
		if (!ent.name) return [];
		// (Implement as required)
		return [];
	}

	/**
	 * Note: there is no "get from SRD," as the single SRD background (as of 2022-04-28) has no data we are
	 * interested in.
	 * @param bg
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.filterValues] Pre-baked filter values to be re-used when importing this from the item.
	 * @param [opts.fluff]
	 * @param [opts.actor]
	 * @param [opts.isActorItem]
	 */
	static async pGetBackgroundItem (bg, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		const fluff = opts.fluff || await Renderer.background.pGetFluff(bg);

		const description = Config.get("importBackground", "isImportDescription")
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => {
				const rendered = [
					fluff?.entries?.length ? Renderer.get().setFirstSection(true).render({type: "entries", entries: fluff?.entries}) : "",
					Renderer.get().setFirstSection(true).render({type: "entries", entries: bg.entries}),
				].filter(Boolean);
				return `<div>${rendered.join("<hr>")}</div>`;
			})
			: "";

		const img = await this._pGetSaveImagePath(bg, {propCompendium: "background", fluff});

		const additionalData = await this._pGetDataSideLoaded(bg);
		const additionalFlags = await this._pGetFlagsSideLoaded(bg);
		const additionalAdvancement = await this._pGetAdvancementSideLoaded(bg);

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: bg, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importBackground", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(bg)),
			type: "background",
			data: {
				description: {value: description, chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(bg),

				// region unused
				damage: {parts: []},
				activation: {type: "", cost: 0, condition: ""},
				duration: {value: null, units: ""},
				target: {value: null, units: "", type: ""},
				range: {value: null, long: null, units: ""},
				uses: {value: 0, max: 0, per: null},
				ability: null,
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				formula: "",
				save: {ability: "", dc: null},
				requirements: "",
				recharge: {value: null, charged: false},
				consume: {type: "", target: "", amount: null},
				// endregion

				advancement: [
					...(additionalAdvancement || []),
				],

				...additionalData,
			},
			flags: {
				...this._getBackgroundFlags(bg, opts),
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
			img,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importBackground", "permissions")};

		return out;
	}

	static _getBackgroundFlags (bg, opts) {
		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_BACKGROUNDS,
				source: bg.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_BACKGROUNDS](bg),
				propDroppable: "background",
				filterValues: opts.filterValues,
			},
		};

		if (opts.isActorItem) out[SharedConsts.MODULE_NAME_FAKE].isDirectImport = true;

		return out;
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGeBackgroundSideData();
		return this._SIDE_DATA;
	}

	static getBackgroundStub () {
		return MiscUtil.copy(DataConverterBackground.STUB_BACKGROUND);
	}
}

// region Fake data used in place of missing records when levelling up
//   (i.e. if the same set of sources have not been selected when re-opening the Charactermancer)
DataConverterBackground.STUB_BACKGROUND = {
	name: "Unknown Background",
	source: SRC_PHB,
	_isStub: true,
};
// endregion

export {DataConverterBackground};
