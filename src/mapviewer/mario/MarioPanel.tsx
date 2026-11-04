import { useEffect, useRef, useState } from "react";

import { MapViewerRenderer } from "../MapViewerRenderer";
import { WebGLMapViewerRenderer } from "../webgl/WebGLMapViewerRenderer";
import { MARIO_SONGS } from "./MarioMusic";
import "./MarioPanel.css";
import { marioRomDownloadUrl } from "./MarioRom";

export function MarioPanel({ renderer }: { renderer: MapViewerRenderer }): JSX.Element {
    const mario = renderer instanceof WebGLMapViewerRenderer ? renderer.mario : undefined;
    const [, refresh] = useState(0);
    const [romUrl, setRomUrl] = useState("");
    const attemptedUrl = useRef<string>();
    let downloadUrl: string | undefined;
    try {
        downloadUrl = marioRomDownloadUrl(romUrl.trim() || attemptedUrl.current || "").href;
        if (!romUrl.trim() && !attemptedUrl.current) downloadUrl = undefined;
    } catch {}
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const timer = window.setInterval(() => refresh((n) => n + 1), 250);
        return () => window.clearInterval(timer);
    }, [mario]);

    useEffect(() => {
        const url = new URLSearchParams(window.location.search).get("rom");
        if (mario && url && !mario.hasRom && attemptedUrl.current !== url) {
            attemptedUrl.current = url;
            setRomUrl(url);
            void mario.start(url);
        }
    }, [mario]);

    return (
        <section className="mario-panel" aria-label="Mario controls">
            <strong>Play as Mario</strong>
            {!mario ? (
                <p>Select the WebGL renderer to play as Mario.</p>
            ) : (
                <>
                    <p role="status">{mario.status}</p>
                    <label className="mario-slider">
                        Mario size: {mario.size.toFixed(2)}×
                        <input
                            aria-label="Mario size"
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.05"
                            value={mario.size}
                            onChange={(e) => {
                                mario.setSize(Number(e.target.value));
                                refresh((n) => n + 1);
                            }}
                        />
                    </label>
                    <label className="mario-slider">
                        Mario speed: {(mario.speed ?? 1).toFixed(2)}×
                        <input
                            aria-label="Mario speed"
                            type="range"
                            min="0.25"
                            max="3"
                            step="0.05"
                            value={mario.speed ?? 1}
                            onChange={(e) => {
                                mario.setSpeed(Number(e.target.value));
                                refresh((n) => n + 1);
                            }}
                        />
                    </label>
                    <label className="mario-slider">
                        Sound effects: {Math.round(mario.volume * 100)}%
                        <input
                            aria-label="Sound effects volume"
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round(mario.volume * 100)}
                            onChange={(e) => {
                                mario.setVolume(Number(e.target.value) / 100);
                                refresh((n) => n + 1);
                            }}
                        />
                    </label>
                    <label className="mario-slider">
                        Music volume: {Math.round((mario.musicVolume ?? 0.3) * 100)}%
                        <input
                            aria-label="Music volume"
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round((mario.musicVolume ?? 0.3) * 100)}
                            onChange={(e) => {
                                mario.setMusicVolume(Number(e.target.value) / 100);
                                refresh((n) => n + 1);
                            }}
                        />
                    </label>
                    <label>
                        Song{" "}
                        <select
                            aria-label="SM64 song"
                            value={mario.song ?? 3}
                            onChange={(e) => {
                                mario.chooseSong(Number(e.target.value));
                                refresh((n) => n + 1);
                            }}
                        >
                            {MARIO_SONGS.map(([id, name]) => (
                                <option key={id} value={id}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div>
                        <button
                            aria-label="Previous song"
                            onClick={() => {
                                mario.cycleSong(-1);
                                refresh((n) => n + 1);
                            }}
                        >
                            Previous
                        </button>
                        <button
                            aria-label="Next song"
                            onClick={() => {
                                mario.cycleSong(1);
                                refresh((n) => n + 1);
                            }}
                        >
                            Next
                        </button>
                    </div>
                    <label style={{ display: "block" }}>
                        <input
                            aria-label="Mario interpolation"
                            type="checkbox"
                            checked={mario.interpolation ?? true}
                            onChange={(e) => {
                                mario.interpolation = e.target.checked;
                                refresh((n) => n + 1);
                            }}
                        />{" "}
                        Mario interpolation
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            aria-label="Show collision"
                            checked={mario.showCollision ?? false}
                            onChange={(e) => {
                                mario.showCollision = e.target.checked;
                                refresh((n) => n + 1);
                            }}
                        />{" "}
                        Show collision
                    </label>
                    {mario.showCollision && (
                        <>
                            <label style={{ display: "block" }}>
                                <input
                                    type="checkbox"
                                    checked={mario.collisionThroughScenery}
                                    onChange={(e) => {
                                        mario.collisionThroughScenery = e.target.checked;
                                        refresh((n) => n + 1);
                                    }}
                                />{" "}
                                Show through scenery
                            </label>
                            <label style={{ display: "block" }}>
                                <input
                                    type="checkbox"
                                    aria-label="Water and lava"
                                    checked={mario.showMapCollision ?? true}
                                    onChange={(e) => {
                                        mario.showMapCollision = e.target.checked;
                                        refresh((n) => n + 1);
                                    }}
                                />{" "}
                                Water and lava
                            </label>
                            <p>
                                Green: gentle floors · Yellow: steep slopes · Orange: near-vertical
                                walls · Purple: ceilings.
                                <br />
                                {mario.showMapCollision && (
                                    <>
                                        Cyan: water surface · Red: lava.
                                        <br />
                                    </>
                                )}
                                {mario.active
                                    ? `${
                                          mario.collisionVertices.length / 9
                                      } streamed collision triangles`
                                    : "Preview of nearby mesh collision — no ROM needed."}
                            </p>
                        </>
                    )}
                    <input
                        ref={fileInput}
                        aria-label="Super Mario 64 US ROM"
                        type="file"
                        accept=".z64,.zip"
                        hidden
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void mario.start(file);
                        }}
                    />
                    {!mario.active && !mario.loading && mario.hasRom && (
                        <button onClick={() => void mario.start()}>Play as Mario</button>
                    )}
                    {!mario.active && !mario.loading && (
                        <>
                            <p>
                                Choose your US SM64 .z64 ROM once per session. It stays in memory
                                and is never uploaded.
                            </p>
                            <button onClick={() => fileInput.current?.click()}>
                                {mario.hasRom ? "Change ROM" : "Choose ROM"}
                            </button>
                        </>
                    )}
                    {!mario.loading && (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (romUrl.trim()) void mario.start(romUrl.trim());
                            }}
                        >
                            <label>
                                ROM URL{" "}
                                <input
                                    aria-label="ROM URL"
                                    type="url"
                                    value={romUrl}
                                    onChange={(e) => setRomUrl(e.target.value)}
                                    placeholder="https://…/sm64.zip"
                                />
                            </label>
                            <button type="submit">Load URL</button>
                            <p>
                                Supports .z64 and ZIP. Remote hosts must allow cross-origin
                                downloads. GitHub and Dropbox file links are converted to direct
                                downloads automatically.
                            </p>
                            {!mario.active && downloadUrl && (
                                <p>
                                    If the host blocks loading,{" "}
                                    <a href={downloadUrl} target="_blank" rel="noreferrer">
                                        open the ROM download
                                    </a>
                                    , save the file, then use Choose ROM.
                                </p>
                            )}
                        </form>
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
                        Triggers: crouch / ground pound · Y / Triangle: door
                    </p>
                    <p>
                        Keyboard: WASD · Space · X · Shift · E: door
                        <br />
                        Drag to orbit. Click the map to resume.
                    </p>
                </>
            )}
        </section>
    );
}
