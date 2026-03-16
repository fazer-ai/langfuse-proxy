/// <reference lib="dom" />

import { beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Button } from "@/client/components/Button";

describe("Button", () => {
  beforeEach(() => {
    cleanup();
  });

  test("renders children correctly", () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole("button")).toHaveTextContent("Click me");
  });

  test("applies primary variant styles by default", () => {
    render(<Button>Primary</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-accent");
  });

  test("applies secondary variant styles", () => {
    render(<Button variant="secondary">Secondary</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-bg-tertiary");
  });

  test("applies danger variant styles", () => {
    render(<Button variant="danger">Danger</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-error");
  });

  test("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  test("is disabled when loading prop is true", () => {
    render(<Button loading>Loading</Button>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  test("shows loading spinner when loading", () => {
    render(<Button loading>Loading</Button>);

    const button = screen.getByRole("button");
    const spinner = button.querySelector("svg");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveClass("animate-spin");
  });

  test("applies custom className", () => {
    render(<Button className="custom-class">Custom</Button>);

    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  test("has type button by default", () => {
    render(<Button>Default type</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  test("allows overriding type attribute", () => {
    render(<Button type="submit">Submit</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
