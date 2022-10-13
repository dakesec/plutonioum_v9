class UtilItem {
	static getNameAsIdentifier (name) { return name.slugify({strict: true}); }
}

export {UtilItem};
