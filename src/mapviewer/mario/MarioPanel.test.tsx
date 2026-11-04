import { fireEvent, render, screen } from "@testing-library/react";

import { MapViewerRenderer } from "../MapViewerRenderer";
import { WebGLMapViewerRenderer } from "../webgl/WebGLMapViewerRenderer";
import { MarioPanel } from "./MarioPanel";

jest.mock("../webgl/WebGLMapViewerRenderer", () => ({ WebGLMapViewerRenderer: class {} }));

test("mute and music checkboxes immediately reflect the selected audio state", () => {
    const audio = {
        muted: false,
        music: true,
        context: { state: "running" },
        setMuted(value: boolean) {
            this.muted = value;
        },
        setMusic(value: boolean) {
            this.music = value;
        },
    };
    const renderer = Object.assign(Object.create(WebGLMapViewerRenderer.prototype), {
        mario: {
            active: true,
            showCollision: false,
            collisionThroughScenery: true,
            collisionVertices: new Int32Array(9),
            audio,
            module: {},
            status: "Mario",
            size: 1.5,
            volume: 0.7,
            speed: 1,
            setSpeed: jest.fn(),
            setSize: jest.fn(),
            setVolume: jest.fn(),
        },
    }) as MapViewerRenderer;
    render(<MarioPanel renderer={renderer} />);
    fireEvent.change(screen.getByLabelText("Mario size"), { target: { value: "2" } });
    expect((renderer as WebGLMapViewerRenderer).mario.setSize).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText("Sound volume"), { target: { value: "35" } });
    expect((renderer as WebGLMapViewerRenderer).mario.setVolume).toHaveBeenCalledWith(0.35);
    fireEvent.change(screen.getByLabelText("Mario speed"), { target: { value: "2" } });
    expect((renderer as WebGLMapViewerRenderer).mario.setSpeed).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByLabelText("Show collision"));
    expect((renderer as WebGLMapViewerRenderer).mario.showCollision).toBe(true);
    expect(screen.getByText(/1 streamed collision triangles/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mute"));
    expect(audio.muted).toBe(true);
    expect(screen.getByLabelText("Mute")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Music"));
    expect(audio.music).toBe(false);
    expect(screen.getByLabelText("Music")).not.toBeChecked();
});
