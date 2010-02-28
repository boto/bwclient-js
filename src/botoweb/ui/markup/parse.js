/**
 * A library of botoweb markup parsers
 *
 * @author Ian Paterson
 */

(function () {
	var self = botoweb.ui.markup;

	botoweb.ui.markup.parse = {
		/**
		 * Parse conditional tags and remove them from the node if the
		 * corresponding condition function returns false.
		 */
		condition: function (node, obj) {
			self.find(node, 'condition', function (val, prop) {
				if (val in boto_web.env.cfg.conditions){
					if(boto_web.env.cfg.conditions[val](obj, this) === false)
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
		trigger: function (node, obj) {
			self.find(node, 'trigger', function (val, prop) {
				if (val in boto_web.env.cfg.triggers)
					boto_web.env.cfg.triggers[val](obj, this);
				else
					this.removeAttr(prop);
			});
		}
	};
})();