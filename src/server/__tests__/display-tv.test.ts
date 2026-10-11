import { describe, expect, it } from "vitest";

import { partitionRanking, pickBackground } from "@/lib/display-tv";

// ش٤: دوالّ العرض النقيّة — تقسيم المنصّة واختيار الخلفيّة.

describe("partitionRanking — منصّة تتويجٍ ٢·١·٣ ثمّ البقيّة", () => {
  const rank = (n: number) => Array.from({ length: n }, (_, i) => ({ rank: i + 1 }));

  it("ثمانية: المنصّة بترتيب العرض ٢·١·٣، ثمّ ٤و٥، ثمّ الباقي", () => {
    const { podium, next2, rest } = partitionRanking(rank(8));
    expect(podium.map((x) => x.rank)).toEqual([2, 1, 3]);
    expect(next2.map((x) => x.rank)).toEqual([4, 5]);
    expect(rest.map((x) => x.rank)).toEqual([6, 7, 8]);
  });

  it("أقلّ من ثلاثة: لا يكسر", () => {
    expect(partitionRanking(rank(1)).podium.map((x) => x.rank)).toEqual([1]);
    expect(partitionRanking(rank(2)).podium.map((x) => x.rank)).toEqual([2, 1]);
    expect(partitionRanking([]).podium).toEqual([]);
  });
});

describe("pickBackground — المرفوعة أو الافتراضيّة، والفيديو منفصل", () => {
  it("بلا خلفيّةٍ ⟵ افتراضيّة النوع", () => {
    expect(pickBackground(null, "MOSQUE")).toEqual({ image: "/brand/display-mosque-bg.webp", video: null });
    expect(pickBackground(null, "HOME")).toEqual({ image: "/brand/display-home-bg.webp", video: null });
  });
  it("صورةٌ مرفوعة تُستعمل بدل الافتراضيّة", () => {
    expect(pickBackground({ url: "https://x/bg.webp", type: "IMAGE" }, "MOSQUE")).toEqual({ image: "https://x/bg.webp", video: null });
  });
  it("فيديو ⟵ عنصر video لا صورة", () => {
    expect(pickBackground({ url: "https://x/bg.mp4", type: "VIDEO" }, "HOME")).toEqual({ image: null, video: "https://x/bg.mp4" });
  });
});
