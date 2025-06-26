import { useState, useEffect, useRef } from "react";

function SimpleRecordButton() {
	const [isRecording, setIsRecording] = useState(false);
	const [audioStream, setAudioStream] = useState(null);
	const [mediaRecorder, setMediaRecorder] = useState(null);
	const [audioBlob, setAudioBlob] = useState(null);
	const [recordingTime, setRecordingTime] = useState(0);
	const timerRef = useRef(null);
	const [activeTab, setActiveTab] = useState("json"); // "json" or "text"
	const [maxSpeakers, setMaxSpeakers] = useState(2);
	//output values
	const [transcriptJson, setTranscriptJson] = useState(null);
	const [transcriptText, setTranscriptText] = useState(null);

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
	formData.append("maxSpeakers", maxSpeakers);

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
		setTranscriptJson(data.jobUrl); // do not stringify
		setTranscriptText(data.text_format);
	return data;
	  //any error is caught
    } catch (error) {
      console.error("Error uploading audio:", error);
    } 

  }

  
// html
return (
  <div className="container mt-5">
    {/* Title */}
    <h3 className="mb-4">Audio Recorder & Transcription</h3>

    {/* Max Speakers Input */}
    <div className="mb-4">
      <label htmlFor="maxSpeakers" className="form-label fw-semibold">
        Max Number of Speakers
      </label>
      <input
        type="number"
        id="maxSpeakers"
        className="form-control"
        min="1"
        value={maxSpeakers}
        onChange={(e) => setMaxSpeakers(parseInt(e.target.value) || 1)}
        placeholder="Enter max number of speakers"
      />
    </div>

    {/* Record Button */}
    <div className="mb-3">
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
    </div>

    {/* Recording Status */}
    {isRecording && (
      <div className="text-center mb-3">
        <p className="text-muted small">Recording in progress...</p>
        <p className="fw-bold font-monospace">
          Time: {formatTime(recordingTime)}
        </p>
      </div>
    )}

    {/* Playback */}
    {audioBlob && (
      <div className="mb-4">
        <p className="fw-semibold">Playback:</p>
        <audio controls className="w-100">
          <source src={URL.createObjectURL(audioBlob)} type="audio/wav" />
        </audio>
      </div>
    )}

    {/* Send Audio Button */}
    <div className="mb-4">
      {audioBlob ? (
        <button className="btn btn-primary" onClick={() => handleSendAudio(audioBlob)}>
          Send Audio
        </button>
      ) : (
        <button className="btn btn-secondary" disabled>
          No Audio Available
        </button>
      )}
    </div>

    {/* Transcript Display */}
    {(transcriptJson || transcriptText) && (
      <div className="p-4 border rounded bg-light">
        <div className="d-flex mb-3">
          <button
            className={`btn me-2 ${activeTab === "json" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setActiveTab("json")}
          >
            JSON View
          </button>
          <button
            className={`btn ${activeTab === "text" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setActiveTab("text")}
          >
            Text View
          </button>
        </div>

        {activeTab === "json" && transcriptJson && (
          <>
            <h5>Full Transcription JSON:</h5>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.9rem" }}>
              {JSON.stringify(transcriptJson, null, 2)}
            </pre>
          </>
        )}

        {activeTab === "text" && transcriptText && (
          <>
            <h5>Full Transcript Text:</h5>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.95rem" }}>
              {transcriptText}
            </div>
          </>
        )}
      </div>
    )}
  </div>
);

}

export default SimpleRecordButton;