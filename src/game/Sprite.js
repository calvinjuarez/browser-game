export class SpriteError extends Error {}
export class SpriteCancelLoadError extends SpriteError {}
export class SpriteOptionError extends SpriteError {}
export class SpriteOutOfBoundsError extends SpriteError {}
export class SpriteTypeError extends TypeError {}
export class SpriteSrcTypeError extends SpriteTypeError {}

const asyncImage = () => { const img = new Image(); img.decoding = 'async'; return img; };

/** @enum {string}
  * @memberof Sprite */
const ReadyState = {
	ERROR: 'error',
	LOADING: 'loading',
	PENDING: 'pending',
	READY: 'ready',
};


/**
 * @param {string} src  The path to the sprite image file.
 * @param {Sprite~options} [options]
 * @param {number} [fps=0]
 * @param {?number|number[]} [frames]
 * @param {boolean} [options.lazy=false]
 * @param {?number|string|{height:number|string,width:number|string}} [size]
 * @param {Sprite~throttle} [throttle]
 */
export default class Sprite {
	constructor(src, options, DEBUG=false) {
		if (typeof DEBUG === 'boolean') this.DEBUG = DEBUG;

		this.#setArchivalProps(src, options);

		this.#setOptions(options);
		this.#initAnimation();

		this.#setSrc(src);
	}


	/** @var {boolean} */
	static DEBUG = false;
	static ReadyState = ReadyState;
	static get DEFAULTS() {
		return {
			fps: 0,
			frames: null,
			lazy: false,
			size: null,
			throttle: stepTime => stepTime,
		};
		/**
		 * @callback Sprite~throttle
		 * @param {number} stepTime
		 * @returns {number}  Modified step time to use for animation timing.
		 */
		/**
		 * @typedef {object} Sprite~options
		 * @property {number} fps
		 * 	The max frame rate of the sprite animation.
		 * @property {?number|number[]} frames
		 * 	Either the number of frames, or an array of frame indexes listing
		 * 	which frames should play in what order.
		 * @property {boolean} lazy
		 * 	Whether to load the image during construction or wait for an
		 * 	explicit call to {@link #load}.
		 * @property {?number|string|{height:number|string,width:number|string}} size
		 * 	Either a number or string in format '{NUMBER}' specifying the pixel
		 * 	length of the height and width of the frame tile, or an object of 2
		 * 	such numbers or strings specifying the height and width separately.
		 * @property {Sprite~throttle} throttle
		 * 	A function taking a number input representing the step time, and
		 * 	and returning a number representing by how much the frame timer
		 * 	should be increased.
		 */
	}


	#frame = 0;
	#frameDuration = 0;
	#frameTime = 0;
	#hasAnimation = false;
	#imgFrames = null;
	#imgLayers = null;
	#loadPromise = null;
	#loadPromiseCancel = () => {};
	#readyState = ReadyState.PENDING;
	#src = '';


	#ensureLoadPromise() {
		if (! (this.#loadPromise instanceof Promise))
			this.#loadPromise = new Promise((resolve, reject) => {
				this.img.onload = resolve;
				this.img.onerror = reject;
				this.#loadPromiseCancel = data => reject(
					Object.assign(new SpriteCancelLoadError(
						`Sprite image loading cancelled.`,
					), { data }),
				);
			});

		this.#loadPromise
			.finally(() => {
				this.#loadPromiseCancel = () => {};
			})
			.then(() => {
				this.#imgFrames = Math.ceil(this.img.width / this.options.size.width);
				this.#imgLayers = Math.ceil(this.img.height / this.options.size.height);

				this.#readyState = ReadyState.READY;
			})
			.catch(error => {
				if (error instanceof SpriteCancelLoadError) {
					this.#readyState = ReadyState.PENDING;
					this.DEBUG && console.log(error.message);
				}
				else {
					this.#readyState = ReadyState.ERROR;
					this.loadError = error;
					this.DEBUG && console.error(
						`Sprite image load failed with error ${error.message}`,
					);
				}

				return error;
			});
	}
	#initAnimation() {
		this.#hasAnimation = (
			this.options.fps > 0 && this.options.frames.length > 1
		);

		if (! this.#hasAnimation) return;

		this.#frameDuration = 1000 / this.options.fps;
	}
	#load() {
		this.#ensureLoadPromise();

		this.#readyState = ReadyState.LOADING;
		this.img.src = this.src;
	}
	#reset() {
		this.#loadPromise = null;
		this.#readyState = ReadyState.PENDING;
	}
	#setArchivalProps(src, options) {
		if (src)
			/** Archival copy of src as passed.
			  * @readonly
			  * @var {*} GameObject#_i */
			Object.defineProperty(this, '_s', { value: src });

		if (options)
			/** Archival copy of options as passed.
			  * @readonly
			  * @var {*} GameObject#_o */
			Object.defineProperty(this, '_o', { value: options });
	}
	#setOptions(options) {
		if (! options) return;

		try {
			options = this.#validateOptions(options);
		}
		catch (err) {
			return console.warn(`${err.name}: ${err.message}`);
		}

		Object.assign(this.options, options);
	}
	#setSrc(src) {
		if (! src || src === this.#src) return;

		if (typeof src !== 'string')
			throw new SpriteSrcTypeError(
				`'src' must be a string (received ${JSON.stringify(src)})`,
			);

		if (this.readyState === ReadyState.LOADING)
			this.#loadPromiseCancel({ reason: 'src change' });

		this.#readyState = ReadyState.PENDING;
		this.#src = src;

		if (this.#src && ! this.options.lazy) this.#load();
	}
	#validateOptions(options) {
		const hasOption = prop => (
			Object.hasOwn(options, prop)
			&& options[prop] != null // options are optional
		);
		const validateNumeric = (name, value) => {
			if (typeof value === 'string')
				value = parseInt(value, 10);

			if (typeof value !== 'number'
			||  Number.isNaN(value))
				throw new SpriteOptionError(
					`'${name}' must be a number (${JSON.stringify(value)})`,
				);
		}

		// boolean
		[ 'lazy' ].forEach(option => {
			if (! hasOption(option)) return;

			options[option] = Boolean(options[option]);
		});

		// numeric
		[ 'fps' ].forEach(option => {
			if (! hasOption(option)) return;

			let value = options[option];

			validateNumeric(option, value);
		});

		if (hasOption('frames')) {
			let { frames } = options;

			if (Array.isArray(frames))
				frames.forEach((frame, i) => {
					if (typeof frame !== 'number')
						throw new SpriteOptionError(
							`Invalid 'frames' (index '${i}' in ${JSON.stringify(options.frames)})`,
						);
				});
			else if (typeof frames === 'number') {
				options.frames = [];

				for (let i = 0; i < frames; i++) options.frames.push(i);
			}
		}

		if (this.options.fps > 0
		&&  this.options.frames > 1
		&&  options.size == null)
			throw new SpriteOptionError(
				`Animation requires passing 'size' option`,
			);

		if (hasOption('size')) {
			let { size } = options;
			let height, width;

			const error = () => new SpriteOptionError(
				`Invalid 'size' option (${JSON.stringify(options.size)})`,
			);

			if (size == null)
				throw error();

			const pxToNumber = value => Number(value.replace(/px$/, ''));

			switch (typeof size) {
				case 'string':
					size = pxToNumber(size);
				// fall through
				case 'number':
					if (Number.isNaN(size)) throw error();

					height = width = size;
				break;
				case 'object':
					[ 'height', 'width' ].forEach(prop => {
						let value = size[prop];

						if (typeof value === 'string')
							value = pxToNumber(value);

						if (typeof value !== 'number'
						||  Number.isNaN(value))
							throw error();

						size[prop] = value;
					});

					({ height, width} = size);
				break;
				default:
					throw error();
			}

			options.size = { height, width };
		}

		if (hasOption('throttle')) {
			if (typeof options.throttle !== 'function')
				throw new SpriteOptionError(
					`'throttle' must be a function (${JSON.stringify(options.throttle)}`,
				);

			let test;
			try { test = options.throttle(10); }
			catch (err) {
				throw new SpriteOptionError(
					`'throttle' errors with message ${JSON.stringify(err.message)}`,
				);
			}

			if (typeof test !== 'number')
				throw new SpriteOptionError(
					`'throttle' must return a number (${JSON.stringify(test)}`,
				);
		}

		return options;
	}


	/** @var {boolean} */
	DEBUG = this.constructor.DEBUG;
	/** @var {Image} */
	img = asyncImage();
	/** @var {?Error} */
	loadError = null;
	/** @var {object} */
	options = Object.assign({}, this.constructor.DEFAULTS);

	/** The pixel location of the current frame in the img.
	  * @readonly
	  * @var {number} */
	get frameLocation() {
		return this.#hasAnimation
			? this.options.frames[this.#frame] * this.options.size.width
			: 0;
	}
	/** @readonly
	  * @var {string} */
	get readyState() { return this.#readyState; }
	/** @readonly
	  * @var {object} */
	get size() { return this.options.size; }
	/** @readonly
	  * @var {?string} */
	get src() { return this.#src; }


	/**
	 * Cancel the image loading.  If no loading is in progress, this silently
	 * does nothing.
	 * @param {object} data
	 */
	cancelLoad(data) {
		this.#loadPromiseCancel(data);

		this.DEBUG && console.log(
			this.readyState === ReadyState.LOADING
				? 'Image loading cancelled'
				: `Image was not loading (readyState was '${this.readyState}'`,
		);
	}
	/**
	 * @returns {Promise}
	 */
	load() {
		if (this.readyState !== ReadyState.PENDING) return;

		this.#load();
	}
	/**
	 * @returns {Promise}
	 */
	ready() {
		this.#ensureLoadPromise();

		return this.#loadPromise;
	}
	/**
	 * @param {Sprite~options} options
	 * @returns {this}
	 * @throws {SpriteOptionError} If any options are invalid.
	 */
	setOptions(options) {
		if (! options) return;

		this.#setOptions(options);
		this.#initAnimation();

		return this;
	}
	/**
	 * @param {string} src
	 * @returns {this}
	 * @throws {SpriteSrcTypeError} If 'src' is not a string.
	 */
	setSrc(src) {
		this.#setSrc(src);

		return this;
	}
	/**
	 * @param {number} frame  The frame index to render.
	 * @param {object} [options]
	 * @param {boolean} [options.end=false]
	 *   If true, will skip to the end of the given frame instead of the start.
	 */
	skipToFrame(frame, options) {
		frame = parseInt(frame, 10);

		if (Number.isNaN(frame))
			throw new SpriteError(
				`Invalid frame ${JSON.stringify(frame)}`,
			);
		if (frame < 0 || frame > this.options.frames.length)
			throw new SpriteOutOfBoundsError(
				`Frame ${JSON.stringify(frame)} does not exist`,
			);

		options = Object.assign({
			// defaults
			end: false,
		}, options);

		// set animation to the start of the given frame
		this.#frame = frame;
		this.#frameTime = options.end ? this.#frameDuration - 1 : 0;
	}
	/**
	 * Method to update the animation frame based on the time elapsed since the
	 * previous update.
	 * @param {number} stepTime
	 */
	update(stepTime) {
		const { frames, throttle } = this.options;

		if (! this.#hasAnimation) return;

		this.#frameTime += throttle(stepTime);

		// When we've accumulated enough time in the current animation frame, we
		// move to the next frame and start the count over again.
		if (this.#frameTime >= this.#frameDuration) {
			this.#frameTime %= this.#frameDuration;
			this.#frame = (this.#frame + 1) % frames.length;
		}

		if (this.DEBUG
		&&  this.#frame > this.options.frames.length)
			console.warn(new SpriteOutOfBoundsError(
				`Frame ${JSON.stringify(this.#frame)} does not exist`,
			).message);
	}
}
