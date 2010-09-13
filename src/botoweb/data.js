/**
 * Abstracts JSON and XML data sources and polling and streaming data
 * connections to simplify input to and output from botoweb.
 *
 * @author Ian Paterson
 */
(function () {

botoweb.data = {
	/**
	 * Creates a new controller for the data which will handle input from the
	 * server.
	 */
	get: function (url, success, error) {
		var controller = new $data.StreamingController(url, success, error);

		controller.resume();
	},

	/**
	 * Maintains data consumption state as well as additional data received from
	 * a streaming data source. Rather than delivering every new object to the
	 * higher level callbacks individually, data is queued to mimick the paging
	 * of a standard AJAX request.
	 *
	 * Provides callbacks for controlling the data flow, including pausing and
	 * resuming the stream. Paging metadata provided by botoweb is used to
	 * ensure that resuming a stream loads the minimal data required to start
	 * where the last read left off.
	 */
	StreamingController: function (url, success, error, opt) {
		opt = opt || {};
		var self = this;

		this.buffer = [];
		this.ready = false;
		this.waiting = true;
		this.active = false;
		this.queue = [];
		this.queue_size = opt.queue_size || 50;
		this.url = url;
		this.next_url = '';
		this.seen_ids = {};
		this.page = 0;
		this.xhr = null;
		this.success = success;
		this.error = error;

		/**
		 * Kills the streaming HTTP connection and prepares the controller to
		 * be resumed.
		 */
		this.abort = function () {
			this.active = false;

			this.xhr.abort();

			// TODO a more elegant resume feature that uses up existing
			// buffered data before requesting new data
			this.buffer = [];
			this.queue = [];
		};

		/**
		 * Open the stream to receive data. Automatically opens the next page
		 * of results if the stream was already started and paused, otherwise
		 * starts at the beginning of the data set.
		 */
		this.resume = function () {
			if (this.active)
				return;

			this.active = true;

			$.comet.get(this.url, function (obj, xhr) {
				self.xhr = xhr;

				self.queue_item(obj);

				// Send results as soon as enough have been collected
				if (self.waiting && self.ready)
					self.push_results();
			});
		};

		/**
		 * Callback allowing the higher level to pull the next page of results.
		 */
		this.next_page = function (success, error) {
			this.success = success || this.success;
			this.error = error || this.error;

			// Send results immediately if queue is full
			if (this.ready)
				this.push_results();

			// If the stream is not running, resume it
			if (!this.active)
				this.resume();

			// Otherwise mark to send once queue is full
			else
				this.waiting = true;
		};

		/**
		 * Adds objects to the queue and parses metadata in the stream. If the
		 * queue is full or the end of the stream is detected, switches the
		 * controller's state to ready to indicate that data can be pushed.
		 */
		this.queue_item = function (obj) {
			// Skip objects that have already been seen
			if (obj.__id__ in this.seen_ids)
				return true;

			if (this.queue.length < this.queue_size) {
				// Process but do not queue metadata
				if (obj.__type__ == '__meta__') {
					if (obj.next_url)
						this.next_url = obj.next_url;
					// No next_url means the data stream has finished
					else {
						this.ready = true;
						this.active = false;
					}
				}
				else {
					this.queue.push(obj);
				}

				// When queue is full we are ready to send data to the callback
				if (this.queue.length >= this.queue_size)
					this.ready = true;

				return true;
			}

			this.buffer.push(obj);
			return false;
		};

		/**
		 * Returns the current queued objects to the success callback. If the
		 * data spans multiple page markers (which are returned by botoweb to
		 * allow paging) we update the StreamingController to the next URL and
		 * reset the index of seen object ids. This allows the stream to be
		 * resumed based on the last data sent to the higher levels.
		 */
		this.push_results = function () {
			// Switched over to a new page in results, forget old seen_ids
			if (this.next_url) {
				this.seen_ids = {};
				this.url = this.next_url;
				this.next_url = '';
			}

			// Record ids that have already been seen, for resuming.
			for (var i = 0; i < this.queue.length; i++) {
				this.seen_ids[this.queue[i].__id__] = true;
			}

			this.waiting = false;
			this.ready = false;

			this.success(this.queue, this);

			this.pull_buffered();
		};

		/**
		 * Pulls raw commands in from the overflow buffer and adds them to the
		 * queue. If the queue is filled at the end of this operation and the
		 * higher level is waiting on results already, the results will be
		 * pushed.
		 */
		this.pull_buffered = function () {
			this.queue = [];
			var i;

			for (i = 0; i < this.buffer.length; i++) {
				// Stop if the queue is full
				if (this.queue.length >= this.queue_size)
					break;

				// Stop if the queue is otherwise full
				if (!this.queue_item(this.buffer[i]))
					break;
			}

			// Remove queued data from the buffer
			if (i < this.buffer.length - 1)
				this.buffer = this.buffer.slice(i + 1);
			else
				this.buffer = [];

			// If a callback was waiting on the next set of data, send it
			if (this.waiting && this.ready)
				this.push_results();
		};
	},

	processors: {

	}
};

var $data = botoweb.data;
var $env = botoweb.env;
var $util = botoweb.util;
})();
