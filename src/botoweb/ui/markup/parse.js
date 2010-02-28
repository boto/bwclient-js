/**
 * A library of botoweb markup parsers
 *
 * @author Ian Paterson
 */

(function () {
	var self = botoweb.ui.markup;

	botoweb.ui.markup.parse = {
		/**
		 * Parse conditional tags and remove them from the block.node if the
		 * corresponding condition function returns false.
		 */
		condition: function (block) {
			self.find(block.node, 'condition', function (val, prop) {
				if (val in botoweb.env.cfg.conditions){
					if(botoweb.env.cfg.conditions[val](block.obj, this) === false)
						this.remove();
				}
				else {
					botoweb.util.error('UI condition does not exist: ' + val);
					this.removeAttr(prop);
				}
			});
		},

		/**
		 * Parse triggers and execute them.
		 */
		trigger: function (block) {
			self.find(block.node, 'trigger', function (val, prop) {
				if (val in botoweb.env.cfg.triggers)
					botoweb.env.cfg.triggers[val](block.obj, this);
				else
					this.removeAttr(prop);
			});
		},

		/**
		 * Parse attributes.
		 */
		attribute: function (block) {
			if (!block.model && !block.obj)
				return;

			self.find(block.node, 'attribute', function() {

			});
		},

		/**
		 * Parse links.
		 */
		link: function (block) {
			if (!block.model && !block.obj)
				return;

			self.find(block.node, 'link', function(val, prop) {
				this.removeAttr(prop);
				this.attr('href', '#');
			});
		},

		/**
		 * Parse attribute lists.
		 */
		attribute_list: function (block) {
			if (!block.model && !block.obj)
				return;

			self.find(block.node, 'attribute_list', function() {
				new botoweb.ui.widgets.AttributeList(this);
			});
		},

		/**
		 * Parse relation blocks.
		 */
		relation: function (block) {
			if (!block.model && !block.obj)
				return;

			self.find(block.node, 'relation', function() {

			});
		},

		/**
		 * Parse date times.
		 */
		date_time: function (block) {
			self.find(block.node, 'date_time', function() {
				new botoweb.ui.widgets.DateTime(this);
			});
		},

		/**
		 * Parse triggers and execute them.
		 */
		editing_tools: function (block) {
			if (!block.model && !block.obj)
				return;

			self.find(block.node, 'editing_tools', function() {
				new botoweb.ui.widgets.EditingTools(this, block.model, (this.attr(self.prop.attributes) || ''));
			});
		}
	};
})();