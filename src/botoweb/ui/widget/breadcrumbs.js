/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.breadcrumbs
 */

/**
 * Tracks page navigation and displays links
 *
 * @param node the node where the breadcrumbs will be placed
 */
botoweb.ui.widgets.Breadcrumbs = function(node) {
	var self = this;

	self.node = $(node);
};
