import { String as Str, pipe } from "effect";
import { CircleAlert, ExternalLink, FlaskConical, Languages, Server, Sigma } from "lucide-react";
import type { ReactNode } from "react";

import { englishRows, englishSource } from "#/pages/leaderboard/model/english";

import { NoteList } from "./note-list";
import type { Note } from "./note-list";
import { Section } from "./section";
import { EnglishTable } from "./tables/english-table";

const COMMIT_START = 0;
const SHORT_COMMIT = 7;

const NOTES: readonly Note[] = [
  {
    icon: <Languages aria-hidden="true" />,
    text: "英語は DecideBench の Choice 400 問（200 対）、日本語は業務ルール判定の Noul 500 問。どちらも 1 か所だけ違う事例の対で、対の正解率は両方に正解した割合",
  },
  {
    icon: <CircleAlert aria-hidden="true" />,
    text: "言語のほかに問題の中身も形式も違うので、差のすべてが言語によるものとは言えない",
  },
  {
    icon: <FlaskConical aria-hidden="true" />,
    text: "DecideBench は選択肢ごとに解いた例を 1 つずつ見せる。JEV と GPT-6 Luna は例なしでも正解率がほぼ変わらない（DecideBench の zero-shot 列）",
  },
  {
    icon: <Server aria-hidden="true" />,
    text: "DecideBench の Kev-4B は自前ホスト、JEV と Clef は AI Space 経由。このベンチはすべて OpenRouter 経由",
  },
  {
    icon: <Sigma aria-hidden="true" />,
    text: "差は日本語から英語を引いたポイント。英語の値は DecideBench の結果ファイルから計算し直し、README の表と一致することを確かめた",
  },
];

const sourceLabel = `${englishSource.name}（${pipe(englishSource.commit, Str.slice(COMMIT_START, SHORT_COMMIT))}、${englishSource.retrievedAt} 取得、${englishSource.license}）`;

const EnglishSection = (): ReactNode => (
  <Section id="english" title="英語との比較（参考）">
    <EnglishTable rows={englishRows} />
    <NoteList notes={NOTES} />
    <a
      href={`${englishSource.url}/tree/${englishSource.commit}`}
      className="text-primary flex items-center gap-2 text-sm underline"
    >
      <ExternalLink aria-hidden="true" className="size-4" />
      {sourceLabel}
    </a>
  </Section>
);

export { EnglishSection };
