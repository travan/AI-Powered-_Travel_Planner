/** @vitest-environment jsdom */
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "../../../../../../packages/ui/src/components/Badge";
import { Button } from "../../../../../../packages/ui/src/components/Button";
import { Card, CardContent, CardFooter, CardHeader } from "../../../../../../packages/ui/src/components/Card";
import { Skeleton, SkeletonActivity, SkeletonCard } from "../../../../../../packages/ui/src/components/Skeleton";
import { cn } from "../../../../../../packages/ui/src/lib/cn";

describe("ui components", () => {
  it("renders Button variants and loading state", () => {
    const { rerender, getByRole, container } = render(
      <Button variant="secondary" size="lg">Click me</Button>
    );

    const button = getByRole("button", { name: "Click me" });
    expect(button.className).toContain("border-gray-300");
    expect(button.className).toContain("h-12");
    expect((button as HTMLButtonElement).disabled).toBe(false);

    rerender(<Button loading>Saving</Button>);
    const loadingButton = getByRole("button", { name: "Saving" });
    expect((loadingButton as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("renders Card composition helpers", () => {
    const { container } = render(
      <Card variant="elevated">
        <CardHeader>Header</CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    const card = container.firstElementChild as HTMLDivElement;
    expect(card.className).toContain("shadow-md");
    expect(container.textContent).toContain("Header");
    expect(container.textContent).toContain("Body");
    expect(container.textContent).toContain("Footer");
  });

  it("renders Badge and Skeleton family classes", () => {
    const { container: badgeContainer } = render(<Badge variant="warning">Hot</Badge>);
    expect(badgeContainer.firstElementChild?.className).toContain("bg-amber-100");

    const { container } = render(
      <div>
        <Skeleton className="h-4 w-4" />
        <SkeletonCard />
        <SkeletonActivity />
      </div>
    );

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("merges utility classes with cn", () => {
    expect(cn("p-2 p-4", ["text-sm", null], "text-base")).toBe("p-4 text-base");
  });
});
