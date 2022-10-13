import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {UtilApplications} from "./UtilApplications.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {UtilDataConverter} from "./UtilDataConverter.js";

class DataConverterRace extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryRace",
		fnLoadJson: Vetools.pGetRaceSideData.bind(Vetools),
		propJson: "race",
		propsMatch: ["source", "name"],
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/family-tree.svg`;

	// TODO(Future) expand/replace this as Foundry allows
	/**
	 * @param race
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.filterValues]
	 */
	static async pGetRaceItem (race, opts) {
		opts = opts || {};

		const img = await this._pGetSaveImagePath(race, {propCompendium: "race"});

		const additionalData = await this._pGetDataSideLoaded(race);
		const additionalFlags = await this._pGetFlagsSideLoaded(race);

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: race, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importRace", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(race)),
			type: "feat",
			data: {
				description: {
					value: await this._pGetRaceDescription(race),
					chat: "",
					unidentified: "",
				},
				source: UtilDataConverter.getSourceWithPagePart(race),

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
				// endregion

				...additionalData,
			},
			flags: {
				[SharedConsts.MODULE_NAME]: {
					page: UrlUtil.PG_RACES,
					source: race.source,
					hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_RACES](race),
					propDroppable: "race",
					filterValues: opts.filterValues,
				},
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
			img,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importRace", "permissions")};

		return out;
	}

	static _pGetRaceDescription (race) {
		if (!Config.get("importRace", "isImportDescription")) return "";

		return UtilDataConverter.pGetWithDescriptionPlugins(() => {
			// TODO include fluff here?
			return `<div><table class="w-100 summary stripe-even">
				<tr>
					<th class="col-4 text-center">Ability Scores</th>
					<th class="col-4 text-center">Size</th>
					<th class="col-4 text-center">Speed</th>
				</tr>
				<tr>
					<td class="text-center">${Renderer.getAbilityData(race.ability).asText}</td>
					<td class="text-center">${(race.size || [SZ_VARIES]).map(sz => Parser.sizeAbvToFull(sz)).join("/")}</td>
					<td class="text-center">${Parser.getSpeedString(race, {isMetric: Config.isUseMetricDistance({configGroup: "importRace"})})}</td>
				</tr>
			</table>
			${Renderer.get().setFirstSection(true).render({type: "entries", entries: race.entries}, 1)}</div>`;
		});
	}

	static _getCompendiumAliases (race) {
		if (!race.name && !race._baseName) return [];

		const out = [];

		// Add inverted race name
		const invertedName = PageFilterRaces.getInvertedName(race.name);
		if (invertedName && invertedName !== race.name) out.push(invertedName);

		// Fall back on base race
		if (race._baseName) out.push(race._baseName);

		return out;
	}

	static isStubRace (race) {
		return race.name === DataConverterRace.STUB_RACE.name && race.source === DataConverterRace.STUB_RACE.source;
	}

	static getRaceStub () {
		return MiscUtil.copy(DataConverterRace.STUB_RACE);
	}
}
// region Fake data used in place of missing records when levelling up
//   (i.e. if the same set of sources have not been selected when re-opening the Charactermancer)
DataConverterRace.STUB_RACE = {
	name: "Unknown Race",
	source: SRC_PHB,
	_isStub: true,
};
// endregion

export {DataConverterRace};
