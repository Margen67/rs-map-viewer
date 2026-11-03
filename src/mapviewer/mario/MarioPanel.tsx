import { useEffect, useRef, useState } from "react";

import { MapViewerRenderer } from "../MapViewerRenderer";
import { WebGLMapViewerRenderer } from "../webgl/WebGLMapViewerRenderer";
import "./MarioPanel.css";

export function MarioPanel({ renderer }: { renderer: MapViewerRenderer }): JSX.Element {
    const mario = renderer instanceof WebGLMapViewerRenderer ? renderer.mario : undefined;
    const [, refresh] = useState(0);
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const timer = window.setInterval(() => refresh((n) => n + 1), 250);
        return () => window.clearInterval(timer);
    }, [mario]);

    return (
        <section className="mario-panel" aria-label="Mario controls">
            <strong>Play as Mario</strong>
            {!mario ? (
                <p>Select the WebGL renderer to play as Mario.</p>
            ) : (
                <>
                    <p role="status">{mario.status}</p>
                    <input
                        ref={fileInput}
                        aria-label="Super Mario 64 US ROM"
                        type="file"
                        accept=".z64"
                        hidden
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void mario.start(file);
                        }}
                    />
                    {!mario.active && !mario.loading && (
                        <>
                            <p>
                                Choose your US SM64 .z64 ROM. It stays in this browser and is never
                                uploaded.
                            </p>
                            <button onClick={() => fileInput.current?.click()}>Choose ROM</button>
                        </>
                    )}
                    {(mario.active || mario.loading) && (
                        <>
                            {mario.active && mario.audio && (
                                <div className="mario-audio">
                                    {(mario.audio.context.state !== "running" ||
                                        mario.audio.error) && (
                                        <button
                                            onClick={() => {
                                                mario.audio?.resume();
                                                renderer.canvas.focus();
                                            }}
                                        >
                                            Enable audio
                                        </button>
                                    )}
                                    {mario.audio.error && <p role="alert">{mario.audio.error}</p>}
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={mario.audio.muted}
                                            onChange={(e) => {
                                                mario.audio?.setMuted(e.target.checked);
                                                refresh((n) => n + 1);
                                            }}
                                        />{" "}
                                        Mute
                                    </label>{" "}
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={mario.audio.music}
                                            onChange={(e) => {
                                                if (mario.module)
                                                    mario.audio?.setMusic(
                                                        e.target.checked,
                                                        mario.module,
                                                    );
                                                refresh((n) => n + 1);
                                            }}
                                        />{" "}
                                        Music
                                    </label>
                                </div>
                            )}
                            {mario.active && (
                                <button
                                    onClick={() => {
                                        mario.respawn();
                                        renderer.canvas.focus();
                                    }}
                                >
                                    Respawn
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    mario.stop();
                                    renderer.canvas.focus();
                                }}
                            >
                                Return to camera
                            </button>
                        </>
                    )}
                    <p>
                        Left stick: move · Right stick: camera
                        <br />
                        A / Cross: jump · X / Square or B / Circle: attack
                        <br />
                        Triggers: crouch / ground pound
                    </p>
                    <p>
                        Keyboard: WASD · Space · X · Shift
                        <br />
                        Drag to orbit. Click the map to resume.
                    </p>
                </>
            )}
        </section>
    );
}
