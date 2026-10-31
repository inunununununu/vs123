const playButton = document.getElementById('audioToggle');
const seek = document.getElementById('seek');
const volume = document.getElementById('volume');
const currentTimeLabel = document.getElementById('currentTime');
const playerStatus = document.getElementById('playerStatus');
const waveform = document.querySelector('.waveform');
const previewDuration = 24;
const tempo = 80;
const beatDuration = 60 / tempo;
const stepDuration = beatDuration / 2;
const chordProgression = [
	[57, 60, 64, 67],
	[53, 57, 60, 64],
	[48, 52, 55, 59],
	[55, 59, 62, 65],
	[57, 60, 64, 67],
	[53, 57, 60, 64],
	[55, 59, 62, 65],
	[48, 52, 55, 59]
];
const melody = [0, 2, 1, 3, 2, 1, 3, 2];
let audioContext;
let masterGain;
let scheduler;
let nextStep = 0;
let playbackOffset = 0;
let playbackStartedAt = 0;
let isPlaying = false;
const activeOscillators = new Set();

function formatTime(seconds) {
	const wholeSeconds = Math.floor(seconds);
	return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function getPosition() {
	if (!isPlaying || !audioContext) {
		return playbackOffset;
	}
	return Math.min(previewDuration, playbackOffset + audioContext.currentTime - playbackStartedAt);
}

function updateProgress() {
	const position = getPosition();
	seek.value = String(position);
	currentTimeLabel.textContent = formatTime(position);
	waveform.style.setProperty('--progress', `${(position / previewDuration) * 100}%`);
	if (isPlaying) {
		requestAnimationFrame(updateProgress);
	}
}

function playTone(frequency, startAt, length, type, level) {
	const oscillator = audioContext.createOscillator();
	const gain = audioContext.createGain();
	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, startAt);
	gain.gain.setValueAtTime(0.0001, startAt);
	gain.gain.exponentialRampToValueAtTime(level, startAt + 0.025);
	gain.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
	oscillator.connect(gain);
	gain.connect(masterGain);
	oscillator.addEventListener('ended', () => activeOscillators.delete(oscillator), { once: true });
	activeOscillators.add(oscillator);
	oscillator.start(startAt);
	oscillator.stop(startAt + length + 0.03);
}

function stopScheduledTones() {
	if (!audioContext) {
		return;
	}
	const stopAt = audioContext.currentTime;
	activeOscillators.forEach((oscillator) => oscillator.stop(stopAt));
	activeOscillators.clear();
}

function scheduleStep(step) {
	const songTime = step * stepDuration;
	const chordIndex = Math.floor(songTime / (beatDuration * 4)) % chordProgression.length;
	const chord = chordProgression[chordIndex];
	const startAt = audioContext.currentTime + Math.max(0, songTime - getPosition());
	const noteIndex = melody[step % melody.length];
	const note = chord[noteIndex] + (step % 16 < 8 ? 12 : 0);
	playTone(440 * Math.pow(2, (note - 69) / 12), startAt, stepDuration * 0.9, 'triangle', 0.12);
	if (step % 8 === 0) {
		chord.forEach((chordNote) => {
			playTone(440 * Math.pow(2, (chordNote - 69) / 12), startAt, beatDuration * 3.8, 'sine', 0.035);
		});
		playTone(440 * Math.pow(2, (chord[0] - 81) / 12), startAt, beatDuration * 1.5, 'sine', 0.12);
	}
}

function runScheduler() {
	const position = getPosition();
	const currentStep = Math.floor(position / stepDuration);
	while (nextStep <= currentStep + 1 && nextStep * stepDuration < previewDuration) {
		scheduleStep(nextStep);
		nextStep += 1;
	}
	if (position >= previewDuration) {
		pausePreview();
		playbackOffset = 0;
		updateProgress();
		playerStatus.textContent = '片段播放完畢，想再聽一次就按下播放。';
	}
}

async function startPreview() {
	if (!audioContext) {
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) {
			playerStatus.textContent = '此瀏覽器不支援音訊播放。';
			return;
		}
		audioContext = new AudioContextClass();
		masterGain = audioContext.createGain();
		masterGain.connect(audioContext.destination);
	}
	try {
		await audioContext.resume();
	} catch (error) {
		console.error('Unable to resume the audio preview.', error);
		playerStatus.textContent = '無法啟動音訊播放，請檢查瀏覽器的音訊設定。';
		return;
	}
	if (playbackOffset >= previewDuration) {
		playbackOffset = 0;
	}
	playbackStartedAt = audioContext.currentTime;
	nextStep = Math.floor(playbackOffset / stepDuration);
	isPlaying = true;
	masterGain.gain.setTargetAtTime(Number(volume.value), audioContext.currentTime, 0.03);
	playButton.classList.add('is-playing');
	playButton.setAttribute('aria-label', '暫停試聽片段');
	playButton.setAttribute('aria-pressed', 'true');
	playerStatus.textContent = '正在播放瀏覽器合成示範音色。';
	scheduler = window.setInterval(runScheduler, 40);
	runScheduler();
	updateProgress();
}

function pausePreview() {
	if (!isPlaying) {
		return;
	}
	playbackOffset = getPosition();
	stopScheduledTones();
	isPlaying = false;
	window.clearInterval(scheduler);
	playButton.classList.remove('is-playing');
	playButton.setAttribute('aria-label', '播放試聽片段');
	playButton.setAttribute('aria-pressed', 'false');
	if (audioContext) {
		audioContext.suspend();
	}
	updateProgress();
	playerStatus.textContent = '試聽已暫停。';
}

playButton.addEventListener('click', () => {
	if (isPlaying) {
		pausePreview();
	} else {
		startPreview();
	}
});

seek.addEventListener('input', () => {
	playbackOffset = Number(seek.value);
	if (isPlaying) {
		stopScheduledTones();
		playbackStartedAt = audioContext.currentTime;
		nextStep = Math.floor(playbackOffset / stepDuration);
	}
	updateProgress();
});

volume.addEventListener('input', () => {
	if (masterGain && audioContext) {
		masterGain.gain.setTargetAtTime(Number(volume.value), audioContext.currentTime, 0.03);
	}
});
