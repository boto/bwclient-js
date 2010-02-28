/**
 * Represents and holds data for a specific block of markup.
 *
 * @author Ian Paterson
 */

botoweb.ui.markup.Block = function (node, parent) {
	var markup = botoweb.ui.markup;
	var self = this;

	this.node = node;
	this.model = null;
	this.obj = null;

	if (parent)
		this.model = parent.model;

	if (node.attr(markup.prop.model)) {
		this.model = botoweb.env.models[node.attr(markup.prop.model)];
	}

	// Do not allow nested blocks to interfere
	markup.remove_nested(this);

	// Parse stuff in the order specified
	$.each(['condition', 'trigger', 'attribute_list', 'attribute', 'editing_tools', 'link'], function () {
		markup.parse[this](self);
	});

	// Add nested blocks again
	markup.restore_nested(this);

	markup.parse.relation(this);
};