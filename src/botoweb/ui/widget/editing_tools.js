/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.editing_tools
 */

/**
 * Displays object editing links based on the actions available to the user.
 *
 * @param node where to insert the icons.
 */
botoweb.ui.widget.EditingTools = function(node, block, actions) {
	var self = this;

	if (!node.is('ul'))
		node = $('<ul />').appendTo(node);

	this.node = $(node).addClass('widget-editing_tools');
	this.model = block.model;
	this.obj = block.obj;
	this.block = block;

	actions = actions || 'edit clone delete';
	actions = actions.split(/[, ]+/);

	for (i in actions.reverse()) {
		var button;

		switch (actions[i]) {
			case 'create':
				if ('post' in this.model.methods)
					button = botoweb.ui.button('Create ' + this.model.name, { icon: 'ui-icon-plus' });
				break;
			case 'clone':
				if (this.obj && 'post' in this.model.methods)
					button = botoweb.ui.button('Clone ' + this.model.name, { icon: 'ui-icon-copy' });
				break;
			case 'delete':
				if (this.obj && 'delete' in this.model.methods)
					button = botoweb.ui.button('Delete', { icon: 'ui-icon-trash' });
				break;
			case 'edit':
				if (this.obj && 'put' in this.model.methods)
					button = botoweb.ui.button('Edit', { icon: 'ui-icon-pencil' });
				break;
		}

		if (button) {
			button.attr(botoweb.ui.markup.prop.link, actions[i])
				.appendTo(
					$('<li/>').prependTo(this.node)
				);
		}
	}

	if (self.obj) {
		function onsave () {
			self.block.save();
		}

		function oncancel () {
			document.location.href = document.location.href.replace(/&action=[^&]*/, '');
		}

		function cleanup () {
			self.node.find('.tmp').remove();
			self.node.find('li').show();
		}

		$(self.obj).bind('edit', function () {
			self.node.find('li').hide();

			botoweb.ui.button('Save Changes', { icon: 'ui-icon-disk' })
				.click(onsave)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));

			botoweb.ui.button('Cancel', { icon: 'ui-icon-close', primary: false })
				.click(oncancel)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));
		});
		$(self.obj).bind('cancel_edit', cleanup);

		$(self.obj).bind('clone create', function () {
			self.node.find('li').hide();

			botoweb.ui.button('Save New ' + self.model.name, { icon: 'ui-icon-disk' })
				.click(onsave)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));

			botoweb.ui.button('Cancel', { icon: 'ui-icon-close', primary: false })
				.click(oncancel)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));
		});
		$(self.obj).bind('cancel_clone cancel_create', cleanup);
	}

	self.node.find('a').addClass('ui-button ui-state-default ui-corner-all');
};
