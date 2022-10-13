import {DataConverter} from "./DataConverter.js";

class DataConverterActor extends DataConverter {
	static _ActionEntryParseState = class {
		constructor () {
			this.isProficient = true;
			this.damageTuples = [];

			this.offensiveAbility = "str"; // This is the default if "null" is specified anyway. Specify it here so we can compensate for it later.
			this.attackBonus = 0;
		}
	};

	static getParsedActionEntryData (entity, action, dataBuilderOpts, {mode = "creature", summonSpellLevel = null} = {}) {
		if (!(action.entries && action.entries[0] && typeof action.entries[0] === "string")) return;

		const state = new this._ActionEntryParseState();

		const str = action.entries[0];

		const {damageTupleMetas} = DataConverter.getDamageTupleMetas(str, {summonSpellLevel});
		const {damageParts, formula} = DataConverter.getDamagePartsAndOtherFormula(damageTupleMetas);

		state.damageTuples.push(...damageParts);

		const {rangeShort, rangeLong} = DataConverter.getAttackRange(str);

		this._getParsedActionEntryData_hit({entity, action, dataBuilderOpts, mode, state});

		const {isAttack, isRecharge, actionType, isMelee, isRanged, isSpell} = DataConverter.getAttackActionType(action.name, str);

		return {
			formula,
			isAttack,
			isRecharge,
			rangeShort,
			rangeLong,
			actionType,
			isMelee,
			isRanged,
			isSpell,
			damageTuples: state.damageTuples,
			offensiveAbility: state.offensiveAbility,
			isProficient: state.isProficient,
			attackBonus: state.attackBonus,
		};
	}

	static _getParsedActionEntryData_hit ({entity, action, dataBuilderOpts, mode, state}) {
		const str = action.entries[0];

		if (/{@hitYourSpellAttack}/gi.test(str)) {
			state.isProficient = true;
			state.offensiveAbility = null;
			// Negate the default bonuses; use the user's ranged spell attack (which we assume is the "primary" mode)
			state.attackBonus = "- @attributes.prof - @mod + @srd5e.userchar.spellAttackRanged";
			return;
		}

		const mHit = /{@hit (?<bonus>[^|}]+)(?:\|[^}]+)?}/gi.exec(str);
		if (!mHit) return;

		const {partsNonNumerical, totalNumerical: toHitNumerical} = this._getProfBonusExpressionParts(mHit.groups.bonus);

		const enchantmentPart = /\+(\d)/.exec(action.name || "");
		const enchBonus = enchantmentPart ? Number(enchantmentPart[0]) : 0;
		const hitBonusFromAbil = toHitNumerical - enchBonus - dataBuilderOpts.getSheetPb();

		// Check this against the damage bonus we might to have from the first damage number
		const dmg1 = state.damageTuples.length ? state.damageTuples[0][0] || "" : "";

		const mDamageBonus = /\d+\s*([-+]\s*\d+)$/.exec(dmg1.trim());
		let damageBonusFromAbil;
		if (mDamageBonus) damageBonusFromAbil = Number(mDamageBonus[1].replace(/\s+/g, "")) - enchBonus;

		// If we have a bonus from dmg1 and it doesn't match that from the +hit, use the one from damage
		//   instead when trying to work out the offensive ability score
		let assumedAbilMod = hitBonusFromAbil;
		if (damageBonusFromAbil != null && hitBonusFromAbil !== damageBonusFromAbil) {
			assumedAbilMod = damageBonusFromAbil;

			// Handles e.g. Ghast bite attack, which lacks proficiency
			if (hitBonusFromAbil < damageBonusFromAbil) {
				state.isProficient = false;
			} else {
				// Handles e.g. Hobgoblin Warlord (double proficiency?) or oddly-enchanted weapons
				// Handles e.g. creatures with no/undefined CR (ERLW's "Steel Defender")
				state.attackBonus = hitBonusFromAbil - damageBonusFromAbil;
			}
		}

		// Loop through abilities until we find one that matches our bonus, or give up if there are none
		let isFoundOffensiveAbility = false;
		for (const k of Parser.ABIL_ABVS) {
			if (entity[k] == null) continue;

			const mod = Parser.getAbilityModNumber(entity[k]);
			if (mod === assumedAbilMod) {
				state.offensiveAbility = k;
				isFoundOffensiveAbility = true;
				break;
			}
		}

		if (mode === "creature") {
			// If we could not find an offensive ability, we're missing some amount of bonus. Try to calculate
			//   what that bonus should be. (Generally this is unnecessary, as enchantment bonuses should be
			//   pulled out above, but there are rare cases like Githyanki Knight Silver Greatswords).
			// Only attempt this for creatures if the proficiency bonus is known.
			if (!isFoundOffensiveAbility && dataBuilderOpts.pb) {
				// This is the number we expect to see on the sheet if we import the item as-is. If it's wrong,
				//   we need to compensate.
				const curCalcBonus = dataBuilderOpts.pb + Parser.getAbilityModNumber(entity[state.offensiveAbility]) + state.attackBonus;

				if (curCalcBonus !== toHitNumerical) {
					const delta = toHitNumerical - curCalcBonus;
					state.attackBonus += delta;
				}
			} // eslint-disable-line brace-style
			// If the numbers don't nicely line up, e.g. for Clay Golem's slam, add the missing offset as a
			//   generic bonus.
			else if (!state.isProficient) {
				const curCalcBonus = Parser.getAbilityModNumber(entity[state.offensiveAbility]) + state.attackBonus;
				if (curCalcBonus !== toHitNumerical) {
					const delta = toHitNumerical - curCalcBonus;
					state.attackBonus += delta;
				}
			}
		}

		// For creatures, just give up and use the whole bonus as the final attack bonus, as it's probably an
		//   arbitrary number anyway.
		if (mode === "object") {
			state.attackBonus = toHitNumerical;
		}

		// region Alternate implementation; we prefer to set the creature's PB with an active effect and retain the
		//   (modified) proficiency bonus instead.
		if (mode === "creature_altImplementation") {
			if (partsNonNumerical.some(it => /^\+?PB$/i.test(it))) {
				// If a creature has a "+PB" term, we assume it's referring to the summoner's PB.
				state.attackBonus += ` + @srd5e.userchar.pb`;
				// Disable the creature's proficiency, as we will use the summoner's
				state.isProficient = false;
			}
		}
		// endregion
	}
}

export {DataConverterActor};
