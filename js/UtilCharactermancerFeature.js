class Charactermancer_Feature_Util {
	/**
	 * For each feature with an optional feature progression, add faux entries which allow us to choose from a type of
	 * optional features.
	 * Unlike the class version, which adds whole features, this simply tacks extra `"options"` entries on to the end
	 * of the feature's entries, which will then be automatically handled as though part of the feature itself.
	 * @param featureList A list of all features, which have *not* been run through the feature post-loader.
	 * @param optfeatList A list of all optionalfeature entities.
	 */
	static addFauxOptionalFeatureEntries (featureList, optfeatList) {
		if (!featureList || !optfeatList) return;

		Object.values(featureList)
			.forEach(arr => {
				if (!(arr instanceof Array)) return;

				for (const feature of arr) {
					if (!feature.entries?.length || !feature.optionalfeatureProgression) continue;

					for (const optFeatProgression of feature.optionalfeatureProgression) {
						this._addFauxOptionalFeatureFeatures_handleFeatProgression(
							optfeatList,
							feature,
							optFeatProgression,
						);
					}
				}
			});
	}

	static _addFauxOptionalFeatureFeatures_handleFeatProgression (optfeatList, feature, optFeatProgression) {
		// We do not support the "by level" table format
		if (optFeatProgression.progression instanceof Array) return;

		// We do not support the "by level" object format
		if (!optFeatProgression.progression["*"]) return;

		const availOptFeats = optfeatList.filter(it => optFeatProgression.featureType instanceof Array && (optFeatProgression.featureType || []).some(ft => it.featureType.includes(ft)));

		feature.entries.push({
			type: "options",
			count: optFeatProgression.progression["*"],
			entries: availOptFeats.map(it => ({
				type: "refOptionalfeature",
				optionalfeature: DataUtil.proxy.getUid("optionalfeature", it, {isMaintainCase: true}),
			})),
			data: {
				_plut_tmpOptionalfeatureList: true,
			},
		});
	}

	static getCleanedFeature_tmpOptionalfeatureList (feature) {
		const cpyFeature = MiscUtil.copy(feature);
		MiscUtil.getWalker()
			.walk(
				cpyFeature,
				{
					array: (arr) => {
						return arr.filter(it => it.data == null || !it.data._plut_tmpOptionalfeatureList);
					},
				},
			);
		return cpyFeature;
	}
}

export {Charactermancer_Feature_Util};
