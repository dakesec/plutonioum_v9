import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {UtilCompat} from "./UtilCompat.js";
import {UtilGameSettings} from "./UtilGameSettings.js";

// region Copied from `converterutils.js`'s `TagCondition`
class CreatureConditionInflictedConverter {
	static getConditionMatches (str) {
		const out = new Set();

		this._CONDITION_INFLICTED_MATCHERS.forEach(re => str.replace(re, (...m) => {
			out.add(m[1]);

			// ", {@condition ...}, ..."
			if (m[2]) m[2].replace(/{@condition ([^}]+)}/g, (...n) => out.add(n[1]));

			// " and {@condition ...}
			if (m[3]) m[3].replace(/{@condition ([^}]+)}/g, (...n) => out.add(n[1]));
		}));

		return [...out].sort(SortUtil.ascSortLower);
	}
}

const __TGT = `(?:target|wielder)`;

CreatureConditionInflictedConverter._CONDITION_INFLICTED_MATCHERS = [
	`(?:creature|enemy|target) is \\w+ {@condition ([^}]+)}`, // "is knocked prone"
	`(?:creature|enemy|target) becomes (?:\\w+ )?{@condition ([^}]+)}`,
	`saving throw (?:by \\d+ or more, it )?is (?:\\w+ )?{@condition ([^}]+)}`, // MM :: Sphinx :: First Roar
	`(?:the save|fails) by \\d+ or more, [^.!?]+?{@condition ([^}]+)}`, // VGM :: Fire Giant Dreadnought :: Shield Charge
	`(?:${__TGT}|creatures?|humanoid|undead|other creatures|enemy) [^.!?]+?(?:succeed|make|pass)[^.!?]+?saving throw[^.!?]+?or (?:fall|be(?:come)?|is) (?:\\w+ )?{@condition ([^}]+)}`,
	`and then be (?:\\w+ )?{@condition ([^}]+)}`,
	`(?:be|is) knocked (?:\\w+ )?{@condition (prone|unconscious)}`,
	`a (?:\\w+ )?{@condition [^}]+} (?:creature|enemy) is (?:\\w+ )?{@condition ([^}]+)}`, // e.g. `a frightened creature is paralyzed`
	`(?<!if )the[^.!?]+?${__TGT} is [^.!?]*?(?<!that isn't ){@condition ([^}]+)}`,
	`the[^.!?]+?${__TGT} is [^.!?]+?, it is {@condition ([^}]+)}(?: \\(escape [^\\)]+\\))?`,
	`begins to [^.!?]+? and is {@condition ([^}]+)}`, // e.g. `begins to turn to stone and is restrained`
	`saving throw[^.!?]+?or [^.!?]+? and remain {@condition ([^}]+)}`, // e.g. `or fall asleep and remain unconscious`
	`saving throw[^.!?]+?or be [^.!?]+? and land {@condition (prone)}`, // MM :: Cloud Giant :: Fling
	`saving throw[^.!?]+?or be (?:pushed|pulled) [^.!?]+? and (?:\\w+ )?{@condition ([^}]+)}`, // MM :: Dragon Turtle :: Tail
	`the engulfed (?:creature|enemy) [^.!?]+? {@condition ([^}]+)}`, // MM :: Gelatinous Cube :: Engulf
	`the ${__TGT} is [^.!?]+? and (?:is )?{@condition ([^}]+)} while`, // MM :: Giant Centipede :: Bite
	`on a failed save[^.!?]+?the (?:${__TGT}|creature) [^.!?]+? {@condition ([^}]+)}`, // MM :: Jackalwere :: Sleep Gaze
	`on a failure[^.!?]+?${__TGT}[^.!?]+?(?:pushed|pulled)[^.!?]+?and (?:\\w+ )?{@condition ([^}]+)}`, // MM :: Marid :: Water Jet
	`a[^.!?]+?(?:creature|enemy)[^.!?]+?to the[^.!?]+?is (?:also )?{@condition ([^}]+)}`, // MM :: Mimic :: Adhesive
	`(?:creature|enemy) gains? \\w+ levels? of {@condition (exhaustion)}`, // MM :: Myconid Adult :: Euphoria Spores
	`(?:saving throw|failed save)[^.!?]+? gains? \\w+ levels? of {@condition (exhaustion)}`, // ERLW :: Belashyrra :: Rend Reality
	`(?:on a successful save|if the saving throw is successful), (?:the ${__TGT} |(?:a|the )creature |(?:an |the )enemy )[^.!?]*?isn't {@condition ([^}]+)}`,
	`or take[^.!?]+?damage and (?:becomes?|is|be) {@condition ([^}]+)}`, // MM :: Quasit || Claw
	`the (?:${__TGT}|creature|enemy) [^.!?]+? and is {@condition ([^}]+)}`, // MM :: Satyr :: Gentle Lullaby
	`${__TGT}\\. [^.!?]+?damage[^.!?]+?and[^.!?]+?${__TGT} is {@condition ([^}]+)}`, // MM :: Vine Blight :: Constrict
	`on a failure[^.!?]+?${__TGT} [^.!?]+?\\. [^.!?]+?is also {@condition ([^}]+)}`, // MM :: Water Elemental :: Whelm
	`(?:(?:a|the|each) ${__TGT}|(?:a|the|each) creature|(?:an|each) enemy)[^.!?]+?takes?[^.!?]+?damage[^.!?]+?and [^.!?]+? {@condition ([^}]+)}`, // AI :: Keg Robot :: Hot Oil Spray
	`(?:creatures|enemies) within \\d+ feet[^.!?]+must succeed[^.!?]+saving throw or be {@condition ([^}]+)}`, // VGM :: Deep Scion :: Psychic Screech
	`creature that fails the save[^.!?]+?{@condition ([^}]+)}`, // VGM :: Gauth :: Stunning Gaze
	`if the ${__TGT} is a creature[^.!?]+?saving throw[^.!?]*?\\. On a failed save[^.!?]+?{@condition ([^}]+)}`, // VGM :: Mindwitness :: Eye Rays
	`while {@condition (?:[^}]+)} in this way, an? (?:${__TGT}|creature|enemy) [^.!?]+{@condition ([^}]+)}`, // VGM :: Vargouille :: Stunning Shriek
	`${__TGT} must succeed[^.!?]+?saving throw[^.!?]+?{@condition ([^}]+)}`, // VGM :: Yuan-ti Pit Master :: Merrshaulk's Slumber
	`fails the saving throw[^.!?]+?is instead{@condition ([^}]+)}`, // ERLW :: Sul Khatesh :: Maddening Secrets
	`on a failure, the [^.!?]+? can [^.!?]+?{@condition ([^}]+)}`, // ERLW :: Zakya Rakshasa :: Martial Prowess
	`the {@condition ([^}]+)} creature can repeat the saving throw`, // GGR :: Archon of the Triumvirate :: Pacifying Presence
	`if the (?:${__TGT}|creature) is already {@condition [^}]+}, it becomes {@condition ([^}]+)}`,
	`(?<!if the )(?:creature|${__TGT}) (?:also becomes|is) {@condition ([^}]+)}`, // MTF :: Eidolon :: Divine Dread
	`magically (?:become|turn)s? {@condition (invisible)}`, // MM :: Will-o'-Wisp :: Invisibility
	{re: `The (?!(?:[^.]+) can sense)(?:[^.]+) is {@condition (invisible)}`, flags: "g"}, // MM :: Invisible Stalker :: Invisibility
	`succeed\\b[^.!?]+\\bsaving throw\\b[^.!?]+\\. (?:It|The (?:creature|target)) is {@condition ([^}]+)}`, // MM :: Beholder :: 6. Telekinetic Ray
]
	.map(it => typeof it === "object" ? it : ({re: it, flags: "gi"}))
	.map(({re, flags}) => new RegExp(`${re}((?:, {@condition [^}]+})*)(,? (?:and|or) {@condition [^}]+})?`, flags));
// endregion

class UtilAutomation {
	static _WALKER_BOR = null;

	static _getEffectConcentrating ({entry, img}) {
		return UtilActiveEffects.getGenericEffect({
			label: entry.name,
			icon: img,
			disabled: false,
			transfer: false,

			key: `StatusEffect`,
			value: `Convenient Effect: Concentrating`,
			mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
			priority: UtilActiveEffects.PRIORITY_BASE,

			flags: {[UtilCompat.MODULE_DAE]: {"selfTarget": true}},
		});
	}

	static getCreatureFeatureEffects ({entry, img, entity}) {
		UtilAutomation._WALKER_BOR = UtilAutomation._WALKER_BOR
			|| MiscUtil.getWalker({keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST, isNoModification: true, isBreakOnReturn: true});

		const condSet = new Set();

		UtilAutomation._WALKER_BOR.walk(
			entry.entries,
			{
				string: str => {
					CreatureConditionInflictedConverter.getConditionMatches(str)
						.forEach(cond => condSet.add(cond));
				},
			},
		);

		if (!condSet.size) return [];

		const conds = [...condSet].sort(SortUtil.ascSortLower);
		const additionalEffects = [];

		let isDisabled = false;
		let isTransfer = false;
		let endsMeta = null;

		const addToEndsMeta = nxt => {
			if (endsMeta == null) endsMeta = {};
			endsMeta = foundry.utils.mergeObject(endsMeta, nxt);
		};

		UtilAutomation._WALKER_BOR.walk(
			entry.entries,
			{
				string: str => { // In order of "least scuffed" to "most scuffed"
					const mEonTCreature = /\b(?<mode>start|end) of (?:the creature's|its) (?:next )?turn\b/i.exec(str);
					if (mEonTCreature) {
						const mode = mEonTCreature.groups.mode.toLowerCase() === "start" ? `turnStart` : `turnEnd`;
						addToEndsMeta({flags: {[UtilCompat.MODULE_DAE]: {"specialDuration": [mode]}}});
					}

					const mEonTSelf = /\b(?<mode>start|end) of\b[^.!?]+\bnext turn\b/i.exec(str);
					if (mEonTSelf) {
						const mode = mEonTSelf.groups.mode.toLowerCase() === "start" ? `turnStartSource` : `turnEndSource`;
						addToEndsMeta({flags: {[UtilCompat.MODULE_DAE]: {"specialDuration": [mode]}}});
					}

					const mDuration = /\b(?:for|the effect lasts(?: for)?)(?: up to)? (?<amount>\d+) (?<unit>minute|hour|day)s??\b/i.exec(str);
					if (mDuration) {
						const amount = Number(mDuration.groups.amount);
						const mult = mDuration.groups.unit.toLowerCase() === "day"
							? 24 * 60 * 60
							: mDuration.groups.unit.toLowerCase() === "hour"
								? 60 * 60
								: mDuration.groups.unit.toLowerCase() === "minute"
									? 60
									: 1;
						addToEndsMeta({durationSeconds: Number(amount) * mult});
					}

					// e.g. Duergar "Invisibility"
					const mSelfUntilAttackOrSpell = /\buntil [^.?!]+ attacks(?:, )?(?: or )?(?:casts a spell|it forces a creature to make a saving throw)\b/.exec(str);
					if (mSelfUntilAttackOrSpell) {
						isTransfer = false;
						addToEndsMeta({
							flags: {
								[UtilCompat.MODULE_DAE]: {
									"selfTarget": true,
									"specialDuration": ["1Action", "1Spell"],
								},
							},
						});
					}

					// e.g. Balhannoth "Vanish"
					const mUntilAttack = /\bbecomes \{@condition invisible} [^.?!]+\bafter it makes an attack roll\b/.exec(str);
					if (mUntilAttack) {
						isTransfer = false;
						addToEndsMeta({
							flags: {
								[UtilCompat.MODULE_DAE]: {
									"selfTarget": true,
									"specialDuration": ["1Attack"],
								},
							},
						});
					}

					// e.g. Green Dragon (lair)
					const mAbilityCheck = new RegExp(`\\b(?<ability>${Object.values(Parser.ATB_ABV_TO_FULL).join("|")}) check,?(?: (?:ending|escaping) [^.?!]+ on a success| and succeeds| [^.?!]*?\\b the effect on a success| freeing\\b[^.?!]*?\\bon a success)\\b`, "i").exec(str);
					// e.g. Boggle "Oil Puddle"
					const mAbilityCheck2 = new RegExp(`\\bending the effect\\b[^.?!]*?\\bwith a successful\\b[^.?!]*?\\b(?<ability>${Object.values(Parser.ATB_ABV_TO_FULL).join("|")}) check`).exec(str);
					if (mAbilityCheck || mAbilityCheck2) {
						const m = mAbilityCheck || mAbilityCheck2;
						const abilAbv = m.groups.ability.slice(0, 3).toLowerCase();
						// FIXME this is a placeholder, as the functionality doesn't exist in DAE as of 2022-08-26
						//   (the check should have a DC?)
						addToEndsMeta({flags: {[UtilCompat.MODULE_DAE]: {"specialDuration": [`isCheck.${abilAbv}`]}}});
					}

					// e.g. Faerie Dragon "Superior Invisibility"
					const mUntilConcEnds = /\buntil [^.?!]+ concentration ends\b/i.exec(str);
					if (mUntilConcEnds) {
						// FIXME this is a placeholder, as the functionality doesn't exist in DAE as of 2022-08-26
						//   (the effect should apply concentration, and end when it ends?)
						addToEndsMeta({});
					}

					// e.g. Geryon "Stinger"
					const mUseShortOrLongRest = /\buntil it finishes a short or long rest\b/i.exec(str);
					if (mUseShortOrLongRest) {
						addToEndsMeta({flags: {[UtilCompat.MODULE_DAE]: {"specialDuration": ["shortRest", "longRest"]}}});
					}

					// e.g. Flumph "Stench Spray"
					const mUseShortRest = /\bcan remove [^.?!]+ using a short rest\b/i.exec(str);
					if (mUseShortRest) {
						addToEndsMeta({flags: {[UtilCompat.MODULE_DAE]: {"specialDuration": ["shortRest"]}}});
					}

					// e.g. Amethyst Dragon (lair)
					const mInitiative20NextRound = /\b(?:until initiative count 20 on the next round|until the next initiative count 20)\b/i.exec(str);
					if (mInitiative20NextRound) {
						// FIXME this is a placeholder, as the functionality doesn't exist in DAE as of 2022-08-26
						//   (the effect should expire specifically on initiative count 20)
						addToEndsMeta({flags: {[UtilCompat.MODULE_DAE]: {"specialDuration": ["turnEndSource"]}}});
					}

					// e.g. Death Dog "Bite"
					const mDiseaseCured = /\buntil the disease (?:is cured|ends)\b/i.exec(str);
					if (mDiseaseCured) {
						// FIXME this is a placeholder, as the functionality doesn't exist in DAE as of 2022-08-26
						//   (the effect should expire when the disease (ideally, another condition) expires?)
						addToEndsMeta({});
					}

					// e.g. Erinyes "Longbow"
					// e.g. Solar "Blinding Gaze"
					const mRemovedBySpell = /\buntil (?:it is removed by the [^.]+? spell or similar magic|magic such as the [^.]+? spell)\b/i.exec(str);
					if (mRemovedBySpell) {
						// FIXME this is a placeholder, as the functionality doesn't exist in DAE as of 2022-08-26
						//   (the effect should expire when the specific spell is cast on the actor)
						addToEndsMeta({});
					}

					// e.g. Aboleth "Enslave"
					const mDeath = /\buntil the [^.!?]+? dies\b/i.exec(str);
					if (mDeath) {
						// FIXME this is a placeholder, as the functionality doesn't exist in DAE as of 2022-08-26
						//   (the effect should expire when the source actor reaches 0 HP)
						addToEndsMeta({});
					}

					if (endsMeta) return true;
				},
			},
		);

		if (UtilGameSettings.isDbg() && !endsMeta) {
			const condsLog = conds
				.filter(it => !["prone", "grappled", "deafened"].includes(it))
				.filter(it => !(conds.includes("grappled") && it === "restrained"));
			if (condsLog.length) {
				console.warn(`No end found for ${entry.name} ending for "${condsLog.join("/")}" for creature "${entity.name}" in e.g.\n${entry.entries[0]}`);
			}
		}

		return [
			...conds
				.map(cond => {
					return UtilActiveEffects.getGenericEffect({
						label: Renderer.stripTags(entry.name),
						icon: img,
						disabled: isDisabled,
						transfer: isTransfer,

						key: `StatusEffect`,
						value: `Convenient Effect: ${cond.toTitleCase()}`,
						mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
						priority: UtilActiveEffects.PRIORITY_BASE,

						...endsMeta,
					});
				}),
			...additionalEffects,
		];
	}
}

export {UtilAutomation};
