"use client";

import { useSyncExternalStore } from "react";
import GameBoard from "./GameBoard";

const subscribeNoop = () => () => {};

type Props = { random?: () => number };

/**
 * 클라이언트 준비 게이트.
 * 서버 렌더와 하이드레이션 첫 렌더(ready=false)에는 선택 버튼·전적 없이 제목과 빈 영역만 렌더한다.
 */
export default function Game({ random }: Props) {
  const ready = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  return (
    <main>
      <h1>가위바위보</h1>
      {ready ? <GameBoard random={random} /> : <div aria-busy="true" />}
    </main>
  );
}
