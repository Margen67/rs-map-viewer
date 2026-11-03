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
        mario: { active: true, audio, module: {}, status: "Mario" },
    }) as MapViewerRenderer;
    render(<MarioPanel renderer={renderer} />);
    fireEvent.click(screen.getByLabelText("Mute"));
    expect(audio.muted).toBe(true);
    expect(screen.getByLabelText("Mute")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Music"));
    expect(audio.music).toBe(false);
    expect(screen.getByLabelText("Music")).not.toBeChecked();
});
