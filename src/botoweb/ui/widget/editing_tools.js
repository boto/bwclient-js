/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.editing_tools
 */

/**
 * Displays object editing links based on the actions available to the user.
 *
 * @param node where to insert the icons.
 */
botoweb.ui.widget.EditingTools = function(node, model, actions) {
	var self = this;

	if (!node.is('ul'))
		node = $('<ul />').appendTo(node);

	self.node = $(node).addClass('widget-editing_tools');
	self.model = model;

	actions = actions || 'edit clone delete';
	actions = actions.split(/[, ]+/);

	for (i in actions.reverse()) {
		var button;

		switch (actions[i]) {
			case 'create':
				if ('post' in self.model.methods)
					button = botoweb.ui.button('Create ' + self.model.name, { icon: 'ui-icon-plus' });
				break;
			case 'clone':
				if ('post' in self.model.methods)
					button = botoweb.ui.button('Clone ' + self.model.name, { icon: 'ui-icon-copy' });
				break;
			case 'delete':
				if ('delete' in self.model.methods)
					button = botoweb.ui.button('Delete', { icon: 'ui-icon-trash' });
				break;
			case 'edit':
				if ('put' in self.model.methods)
					button = botoweb.ui.button('Edit', { icon: 'ui-icon-pencil' });
				break;
		}

		if (button) {
			button.attr(botoweb.ui.markup.prop.link, actions[i])
				.appendTo(
					$('<li/>').prependTo(self.node)
				);
		}
	}

	self.node.find('a').addClass('ui-button ui-state-default ui-corner-all');
};
