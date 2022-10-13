import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";

class DataConverterPsionic extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryPsionic",
		fnLoadJson: Vetools.pGetPsionicsSideData,
		propJson: "psionic",
	};

	// region TODO(v10) extract these into their own importers a la `backgroundFeature` etc.
	static _SIDE_DATA_DISCIPLINE_FOCUS_OPTS = {
		propBrew: "foundryPsionicDisciplineFocus",
		fnLoadJson: Vetools.pGetPsionicsSideData,
		propJson: "psionicDisciplineFocus",
	};

	static _SIDE_DATA_DISCIPLINE_ACTIVE_OPTS = {
		propBrew: "foundryPsionicDisciplineActive",
		fnLoadJson: Vetools.pGetPsionicsSideData,
		propJson: "psionicDisciplineActive",
		propsMatch: ["psionicSource", "psionicName", "source", "name"],
	};
	// endregion

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/brain.svg`;

	/**
	 * @param psi
	 * @param [opts]
	 * @param [opts.filterValues]
	 * @param [opts.psiPointsItemId]
	 * @param [opts.actor]
	 */
	static async pGetPsionicItems (psi, opts) {
		opts = opts || {};
		return [
			await this._getPsionicItems_pGetTalentItem(psi, opts),
			await this._getPsionicItems_pGetDisciplineFocusItem(psi, opts),
			...(await this._getPsionicItems_pGetDisciplineActiveItems(psi, opts)),
		].filter(Boolean);
	}

	static _getPsionicFlags (psi, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_PSIONICS,
				source: psi.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_PSIONICS](psi),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = "psionic";
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async _getPsionicItems_pGetTalentItem (psi, opts) {
		if (psi.type !== "T") return null;

		// region Damage
		const strEntries = JSON.stringify(psi.entries);

		let damageDice = "";
		let cantripScaling = null;
		const diceTiers = [];
		// Find cantrip scaling values, which are shown in brackets
		strEntries.replace(/\({@damage ([^}]+)}\)/g, (...m) => diceTiers.push(m[1]));
		// Find dice _not_ in brackets
		const baseVal = /(?:^|[^(]){@dice ([^}]+)}(?:[^)]|$)/.exec(strEntries);
		// Cantrips scale at levels 5, 11, and 17
		if (diceTiers.length === 3) {
			if (baseVal) cantripScaling = baseVal[1];
			// failing that, just use the first bracketed value
			else cantripScaling = diceTiers[0];
		}
		if (baseVal) damageDice = baseVal[1];
		else if (diceTiers.length) damageDice = diceTiers[0];

		if (!Config.get("importPsionic", "isImportAsSpell")) {
			// Manually add cantrip scaling, since we don't use spells
			if (damageDice && cantripScaling) {
				damageDice = `${damageDice} + (max(sign(floor((@details.level + 1) / 6)), 0) * (${cantripScaling})) + (max(sign(floor((@details.level - 5) / 6)), 0) * (${cantripScaling})) + (max(sign(floor((@details.level - 11) / 6)), 0) * (${cantripScaling}))`;
			}
		}

		const damageType = this._getPsionicItems_getDamageTypeFromString(strEntries);
		const damage = damageDice ? [damageDice, damageType].filter(Boolean) : null;
		// endregion

		const img = await this._pGetImagePath(psi);

		const additionalData = await this._pGetDataSideLoaded(psi);
		const additionalFlags = await this._pGetFlagsSideLoaded(psi);

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: psi, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importPsionic", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = await DataConverter.pGetItemActorPassive(
			psi,
			{
				mode: "player",
				actor: opts.actor,
				img,
				additionalData,
				additionalFlags,
				effects: effectsSideTuples.map(it => it.effect),
				description: Config.get("importPsionic", "isImportDescription")
					? await UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>${Renderer.psionic.getBodyText(psi, Renderer.get())}</div>`)
					: "",
				damageParts: [damage].filter(Boolean),
				formula: "", // Override the `formula` value to avoid duplicating our `damageParts`
				ability: "int",
				foundryFlags: this._getPsionicFlags(psi, opts),
			},
		);

		if (Config.get("importPsionic", "isImportAsSpell")) {
			out.type = "spell";

			Object.assign(
				out.data,
				{
					level: 0,
					school: "evo",
					components: {value: "", vocal: false, somatic: false, material: false, ritual: false, concentration: false},
					materials: {value: "", consumed: false, cost: 0, supply: 0},
					scaling: {
						mode: cantripScaling ? "cantrip" : "none",
						formula: cantripScaling || "",
					},
					preparation: {mode: "always", prepared: true},
				},
			);
		}

		return out;
	}

	static async _getPsionicItems_pGetDisciplineFocusItem (psi, opts) {
		if (psi.type !== "D") return null;

		const img = await this._pGetImagePath(psi);

		const additionalData = await this._pGetDataSideLoaded(psi, {propOpts: "_SIDE_DATA_DISCIPLINE_FOCUS_OPTS"});
		const additionalFlags = await this._pGetFlagsSideLoaded(psi, {propOpts: "_SIDE_DATA_DISCIPLINE_FOCUS_OPTS"});

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: psi, img}, {propOpts: "_SIDE_DATA_DISCIPLINE_FOCUS_OPTS"});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importPsionic", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = await DataConverter.pGetItemActorPassive(
			psi,
			{
				displayName: `${psi.name} - Focus`,
				actionType: "other",
				activationType: "bonus",
				activationCost: 1,
				activationCondition: "Only one focus may be active at a time",
				mode: "player",
				actor: opts.actor,
				img,
				additionalData,
				additionalFlags,
				effects: effectsSideTuples,
				description: Config.get("importPsionic", "isImportDescription")
					? await UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>${Renderer.get().setFirstSection(true).render({entries: [psi.focus]})}</div>`)
					: "",
				ability: "int",
				foundryFlags: this._getPsionicFlags(psi, opts),
			},
		);

		if (Config.get("importPsionic", "isImportAsSpell")) {
			out.type = "spell";

			Object.assign(
				out.data,
				{
					level: 0,
					school: "evo",
					components: {value: "", vocal: false, somatic: false, material: false, ritual: false, concentration: false},
					materials: {value: "", consumed: false, cost: 0, supply: 0},
					scaling: {mode: "none", formula: ""},
					preparation: {mode: "always", prepared: true},
				},
			);
		}

		return out;
	}

	static async _getPsionicItems_pGetDisciplineActiveItems (psi, opts) {
		if (psi.type === "T") return [];

		const out = [];
		for (const psiMode of psi.modes) {
			Renderer.psionic.enhanceMode(psiMode);

			const subFeature = await this._getPsionicItems_pGetDisciplineActiveItem(psi, psiMode, opts);
			out.push(subFeature);

			if (psiMode.submodes) {
				for (const psiSubMode of psiMode.submodes) {
					const subSubFeature = await this._getPsionicItems_pGetDisciplineActiveItem(psi, psiSubMode, opts, {parentModeName: psiMode.name, actionType: subFeature.data.actionType});
					out.push(subSubFeature);
				}
			}
		}

		return out;
	}

	static async _getPsionicItems_pGetDisciplineActiveItem (psi, psiMode, opts, {parentModeName, actionType} = {}) {
		const getCostPart = (it) => it.cost ? ` (${it.cost.min === it.cost.max ? it.cost.min : `${it.cost.min}-${it.cost.max}`}psi)` : "";

		const submodePart = psiMode.submodes
			? Renderer.get().setFirstSection(true).render(
				{
					type: "list",
					style: "list-hang-notitle",
					items: psiMode.submodes.map(it => ({
						type: "item",
						name: `${it.name}${getCostPart(it)}`,
						entry: it.entries.join("<br>"),
					})),
				},
				2)
			: "";
		const description = Config.get("importPsionic", "isImportDescription")
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>
					${Renderer.get().setFirstSection(true).render({entries: psiMode.entries}, 2)}
					${submodePart}
				</div>`)
			: "";

		// region Damage
		const strEntries = JSON.stringify(psiMode.entries);

		let scaling = null;
		const damageList = [];
		// Just assume that whatever the first damage type turns out to be is the damage type for everything
		const damageType = this._getPsionicItems_getDamageTypeFromString(strEntries);
		// Assume the first scaling dice is the only scaling dice
		strEntries.replace(/{@(?:scaledice|scaledamage) ([^}]+)}/, (...m) => {
			const [baseDamage, _, addPerProgress] = m[1].split("|");
			damageList.push(baseDamage);
			scaling = addPerProgress;
		});

		// Prefer damage values from @scaledice/@scaledamage, as most psionics have 1-7 point damage scaling
		if (!damageList.length) {
			strEntries.replace(/{@damage ([^}]+)}/g, (...m) => damageList.push(m[1]));
		}

		const damageParts = damageList.map(dmg => [dmg, damageType].filter(Boolean));
		// endregion

		const level = psiMode.cost ? psiMode.cost.min : psiMode.submodes ? MiscUtil.get(psiMode.submodes.find(it => it.cost), "cost", "min") || 1 : 1;

		const durationValue = psiMode.concentration ? psiMode.concentration.duration : 0;
		const durationUnits = (psiMode.concentration ? DataConverterPsionic._PSI_DURATION_MAP[psiMode.concentration.unit] : "") || "";

		const {consumeType, consumeTarget, consumeAmount} = this._getPsionicItems_getConsume({psi, psiMode, opts, level});

		const displayName = `${psi.name} - ${parentModeName ? `${parentModeName}; ` : ""}${psiMode.name}`;
		const entFauxSideData = {name: psiMode.name, source: psi.source, psionicName: psi.name, psionicSource: psi.source};

		const img = await this._pGetImagePath(psi);

		const additionalData = await this._pGetDataSideLoaded(entFauxSideData, {propOpts: "_SIDE_DATA_DISCIPLINE_ACTIVE_OPTS"});
		const additionalFlags = await this._pGetFlagsSideLoaded(entFauxSideData, {propOpts: "_SIDE_DATA_DISCIPLINE_ACTIVE_OPTS"});

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: psi, img}, {propOpts: "_SIDE_DATA_DISCIPLINE_ACTIVE_OPTS"});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importPsionic", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = await DataConverter.pGetItemActorPassive(
			psiMode,
			{
				displayName,
				page: psi.page,
				source: psi.source,
				mode: "player",
				actor: opts.actor,
				img,
				additionalData,
				additionalFlags,
				effects: effectsSideTuples.map(it => it.effect),
				description,
				damageParts,
				formula: "", // Override the `formula` value to avoid duplicating our `damageParts`
				durationValue,
				durationUnits,
				consumeType,
				consumeTarget,
				consumeAmount,
				ability: "int",
				actionType: actionType === "other" ? undefined : actionType,
				foundryFlags: this._getPsionicFlags(psi, opts),
			},
		);

		if (Config.get("importPsionic", "isImportAsSpell")) {
			out.type = "spell";

			Object.assign(
				out.data,
				{
					level: level,
					school: "evo",
					components: {value: "", vocal: false, somatic: false, material: false, ritual: false, concentration: !!psiMode.concentration},
					materials: {value: "", consumed: false, cost: 0, supply: 0},
					scaling: {mode: scaling ? "level" : "none", formula: scaling || ""},
					critical: {threshold: null, damage: ""},
					preparation: {mode: "always", prepared: true},
				},
			);
		}

		return out;
	}

	// region psionic utils
	static _getPsionicItems_getConsume ({opts, level}) {
		let consumeType = opts.consumeType ?? "";
		let consumeTarget = opts.consumeTarget ?? null;
		let consumeAmount = opts.consumeAmount ?? null;

		if (opts.consumeTarget != null) return {consumeType, consumeTarget, consumeAmount};

		const resource = Config.getPsiPointsResource({isValueKey: true});
		consumeAmount = level;

		if (resource === ConfigConsts.C_SPELL_POINTS_RESOURCE__SHEET_ITEM) {
			consumeType = "charges";
			consumeTarget = opts.psiPointsItemId;
		} else {
			consumeType = "attribute";
			consumeTarget = resource;
		}

		return {consumeType, consumeTarget, consumeAmount};
	}

	static _getPsionicItems_getDamageTypeFromString (strEntries) {
		const msDamageTypes = Parser.DMG_TYPES.map(typ => (new RegExp(`(${typ})[^.]+damage`, "ig")).exec(strEntries));
		const damageTypes = msDamageTypes.filter(Boolean).map(it => it[1].toLowerCase());
		return damageTypes[0] || null;
	}
	// endregion

	// TODO(Future) expand/replace this as Foundry allows
	/**
	 * @param psi
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 */
	static async pGetPsionicItem (psi, opts) {
		opts = opts || {};

		const typeOrderStr = Renderer.psionic.getTypeOrderString(psi);
		const desc = `<p><i>${typeOrderStr}</i></p>${Renderer.psionic.getBodyText(psi, Renderer.get().setFirstSection(true))}`;

		const img = await this._pGetSaveImagePath(psi);

		const additionalData = await this._pGetDataSideLoaded(psi);
		const additionalFlags = await this._pGetFlagsSideLoaded(psi);

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: psi, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importPsionic", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(psi)),
			type: "feat",
			data: {
				description: {
					value: Config.get("importPsionic", "isImportDescription")
						? await UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>${desc}</div>`)
						: "",
					chat: "",
					unidentified: "",
				},
				source: UtilDataConverter.getSourceWithPagePart(psi),

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
				...this._getPsionicFlags(psi, opts),
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
			img,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importPsionic", "permissions")};

		return out;
	}
}

DataConverterPsionic._PSI_DURATION_MAP = {
	"min": "minute",
	"hr": "hour",
	"rnd": "round",
};

export {DataConverterPsionic};
