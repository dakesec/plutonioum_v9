class UtilTokens {
	static getTokenDimensionsAndScale (size) {
		return {
			[SZ_TINY]: {dimensions: 0.5},
			[SZ_SMALL]: {dimensions: 1, scale: 0.8},
			[SZ_LARGE]: {dimensions: 2},
			[SZ_HUGE]: {dimensions: 3},
			[SZ_GARGANTUAN]: {dimensions: 4},
		}[size] || {};
	}
}

export {UtilTokens};
