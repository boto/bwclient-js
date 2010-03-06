/**
 * Represents and holds data for a specific block of markup.
 *
 * @author Ian Paterson
 */

botoweb.ui.markup.Block = function (node, opt) {
	if (!opt) opt = {};

	var markup = botoweb.ui.markup;
	var self = this;

	this.node = node;
	this.obj = opt.obj;
	this.model = opt.model;
	this.parent = opt.parent;
	this.onready = opt.onready;
	this.nested = [];
	this.waiting = 0;

	if (this.obj && !this.model)
		this.model = this.obj.model;

	this.skip_markup = opt.skip_markup || {};
	this.nested_sel = opt.nested_sel;

	/**
	 * Passes parsing optimization data along to a new block created from node.
	 * The node should of course be the same as the node that was used to create
	 * this block, otherwise the optimization data is probably invalid.
	 *
	 * @param {DOMNode} node The node to build the Block on.
	 * @param {Object} opt Same options as Block constructor.
	 */
	this.clone = function (node, opt) {
		if (!opt) opt = {};

		opt.skip_markup = this.skip_markup;
		opt.nested_sel = this.nested_sel;

		return new botoweb.ui.markup.Block(node, opt);
	};

	if (this.parent && !this.model)
		this.model = this.parent.model;

	if (node.attr(markup.prop.model)) {
		this.model = botoweb.env.models[node.attr(markup.prop.model)];
	}

	/**
	 * If the parsing routine has not been marked to skip, runs the parsing
	 * function. If the parsing function returns
	 *
	 * @private
	 */
	function parse (str, fnc) {
		if (self.skip_markup[str])
			return;

		// If the parser returns false, skip it next time
		if (fnc(self) === false)
			self.skip_markup[str] = 1;
	}

	// Do not allow nested blocks to interfere
	parse('nested', markup.remove_nested);

	// Parse stuff in the order specified
	$.each(['condition', 'trigger', 'attribute_list', 'attribute', 'editing_tools', 'link'], function () {
		if (!self.skip_markup[this])
			parse(this, markup.parse[this]);
	});

	// Add nested blocks again
	markup.restore_nested(this);

	// Parse stuff in the order specified
	$.each(['relation','search'], function () {
		if (!self.skip_markup[this])
			parse(this, markup.parse[this]);
	});

	if (!this.waiting && this.onready) {
		this.onready(this);
	}
};