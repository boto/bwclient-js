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
	this.model = node.attr(botoweb.ui.markup.prop.model);
	this.obj_id = block.obj_id;
	this.block = block;

	if (this.model)
		this.model = botoweb.env.models[this.model];

	if (!this.model)
		this.model = block.model;

	if (this.obj_id)
		actions = actions || 'edit clone delete';
	else if (this.model)
		actions = actions || 'create';
	actions = actions.split(/[, ]+/);

	for (i in actions.reverse()) {
		if (!actions[i])
			continue;

		var button;

		var action = actions[i].replace(/\(.*/, '');

		switch (action) {
			case 'create':
				if ('post' in this.model.methods)
					button = botoweb.ui.button('Create ' + this.model.name, { icon: 'ui-icon-plus' });
				break;
			case 'clone':
				if (this.obj_id && 'post' in this.model.methods)
					button = botoweb.ui.button('Clone ' + this.model.name, { icon: 'ui-icon-copy' });
				break;
			case 'delete':
				if (this.obj_id && 'delete' in this.model.methods)
					button = botoweb.ui.button('Delete', { icon: 'ui-icon-trash' });
				break;
			case 'edit':
				if (this.obj_id && 'put' in this.model.methods)
					button = botoweb.ui.button('Edit', { icon: 'ui-icon-pencil' });
				break;
		}

		if (button && actions[i]) {
			button.attr(botoweb.ui.markup.prop.link, actions[i])
				.appendTo(
					$('<li/>').prependTo(this.node)
				);
		}
	}

	if (self.block) {
		function onsave () {
			botoweb.ui.overlay.show();
			self.block.save(function () {
				botoweb.ui.overlay.hide();

				botoweb.ui.page.uncache(botoweb.ui.page.location.full.replace(/&action=[^&]*/, ''));

				if (self.block.opt.root) {
					// Force the page to redirect to the object page - this will
					// be needed if the user did a Save and Continue Editing on
					// a create page.
					if (document.location.href.indexOf('redirect=true') >= 0)
						self.block.no_obj = true;
					else
						document.location.href = document.location.href.replace(/&action=[^&]*/, '');
				}
			});
		}

		function onupdate () {
			botoweb.ui.overlay.show();

			self.block.save(function (obj) {
				// Allow the block to be saved again
				self.block.saved = false;

				// On saving a new object, we need to include its ID in the NEW
				// object URL so that we do not create a new object.
				if (self.block.opt.root && self.block.no_obj && botoweb.ui.page.location.data.id != obj.id) {
					// Changing the URL immediately causes problems
					setTimeout(function () {
						document.location.href += '&redirect=true&id=' + escape(obj.id);
					}, 500);

					botoweb.ui.overlay.hide();
				}
				else
					// Refresh the page but prevent it from redirecting
					botoweb.ui.page.refresh(true);

				return false;
			});
		}

		function oncancel () {
			// Editing an object?
			if (botoweb.ui.page.location.data.id) {
				// Force the page to redirect to the object page - this will
				// be needed if the user did a Save and Continue Editing on
				// a create page.
				if (document.location.href.indexOf('redirect=true') >= 0)
					document.location.href = '#' + botoweb.util.interpolate(botoweb.env.cfg.templates.model, self.model) + '?id=' + escape(self.obj_id);
				else
					document.location.href = document.location.href.replace(/&action=[^&]*/, '');
			}

			// Or creating something new
			else
				history.back();
		}

		function cleanup () {
			self.node.find('.tmp').remove();
			self.node.find('li').show();
		}

		$(self.block).bind('edit', function () {
			self.node.find('li').hide();

			botoweb.ui.button('Save Changes<br /><small>and finish editing</small>', { icon: 'ui-icon-disk' })
				.click(onsave)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));

			botoweb.ui.button('Save Changes<br /><small>and continue editing</small>', { icon: 'ui-icon-disk', primary: true })
				.click(onupdate)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));

			botoweb.ui.button('Cancel Changes<br /><small>since last save</small>', { icon: 'ui-icon-close', primary: false })
				.click(oncancel)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));
		});
		$(self.block).bind('cancel_edit', cleanup);

		$(self.block).bind('clone create', function () {
			self.node.find('li').hide();

			botoweb.ui.button('Save New ' + self.model.name, { icon: 'ui-icon-disk' })
				.click(onsave)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));

			botoweb.ui.button('Cancel', { icon: 'ui-icon-close', primary: false })
				.click(oncancel)
				.appendTo($('<li class="tmp"/>').appendTo(self.node));
		});
		$(self.block).bind('cancel_clone cancel_create', cleanup);
	}

	self.node.find('a').addClass('ui-button ui-state-default ui-corner-all');
};
