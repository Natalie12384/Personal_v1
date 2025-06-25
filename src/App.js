import { useState, useEffect, useRef } from "react";

function SimpleRecordButton() {
	const [isRecording, setIsRecording] = useState(false);
	const [audioStream, setAudioStream] = useState(null);
	const [mediaRecorder, setMediaRecorder] = useState(null);
	const [audioBlob, setAudioBlob] = useState(null);
	const [recordingTime, setRecordingTime] = useState(0);
	const timerRef = useRef(null);
	const RECORDING_MAX_DURATION = 240; // optional 
  const portNumber = 8000;

	useEffect(() => {
		if (!audioStream) {
			navigator.mediaDevices
				.getUserMedia({ audio: true })
				.then((stream) => {
					setAudioStream(stream);
					const mediaRecorder = new MediaRecorder(stream);
					setMediaRecorder(mediaRecorder);
					let audio;

					mediaRecorder.ondataavailable = (event) => {
						if (event.data.size > 0) {
							audio = [event.data];
						}
					};

					mediaRecorder.onstop = (event) => {
						const b = new Blob(audio, { type: "audio/wav" });
						setAudioBlob(b);
						console.log("audioBlob", b);
					};
				})
				.catch((error) => {
					console.error("Error accessing microphone:", error);
				});
		}

		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, [audioStream]);

	const handleToggleRecording = (event) => {
		event.preventDefault();
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	};

	const startRecording = () => {
		mediaRecorder.start();
		setIsRecording(true);
		setRecordingTime(0);
		setAudioBlob(null);
		timerRef.current = setInterval(() => {
			setRecordingTime((prevTime) => {
				return prevTime + 1;
			});
		}, 1000);
	};

	const stopRecording = () => {
		mediaRecorder.stop();
		setIsRecording(false);
		if (timerRef.current) {
			clearInterval(timerRef.current);
		}
	};

	const formatTime = (seconds) => {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
	};

  const handleSendAudio = async (audioBlob) => {
    console.log("pressed")
    if (!audioBlob) return;

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");

    try { // send audio via post request
      const bkUrl = "http://localhost:" + portNumber + "/upload_audio";
      const response = await fetch(bkUrl, {
        method: "POST",
        body: formData
      })
      if (!response.ok) {
        console.log("Failed to upload audio", response)
        throw new Error("Failed to upload audio");
      } 
      const data = await response.json();
      console.log("Upload successful:", data);
      return data

    } catch (error) {
      console.error("Error uploading audio:", error);
    } 

  }
// html
return (
  <div className="container mt-4">
    {/* Record Button */}
    <button
      onClick={handleToggleRecording}
      className={`btn ${isRecording ? "btn-danger" : "btn-success"} px-4 py-2`}
    >
      {isRecording ? (
        <>
          <span className="me-2">●</span> Stop Recording
        </>
      ) : (
        "Start Recording"
      )}
    </button>

    {/* Recording Status */}
    {isRecording && (
      <div className="text-center mt-3">
        <p className="text-muted small">Recording...</p>
        <p className="fw-bold font-monospace">
          Time: {formatTime(recordingTime)}
        </p>
      </div>
    )}

    {/* Playback */}
    {audioBlob && (
      <div className="mt-4">
        <p className="mb-1 fw-semibold">Playback:</p>
        <audio controls className="w-100">
          <source src={URL.createObjectURL(audioBlob)} type="audio/wav" />
        </audio>
      </div>
    )}

    {/* Send audio */}
    {audioBlob ? (
        <>
          <button className="btn btn-primary mt-3" onClick={()=>handleSendAudio(audioBlob)}>Send Audio</button> 
        </>
      ) : (
        <button className="btn btn-primary mt-3">No Audio Available</button>
      )}
  </div>
);

}

export default SimpleRecordButton;