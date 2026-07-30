import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "node_modules", "pretendard", "dist", "public", "static", "alternative");
const REGULAR = path.join(FONT_DIR, "Pretendard-Regular.ttf");
const BOLD = path.join(FONT_DIR, "Pretendard-Bold.ttf");

const TYPE_LABEL = {
  regular: "정기 기부 약정서",
  legacy: "유산 기부 약정서",
  hometown: "고향사랑기부 신청서",
  heritage: "문화유산 후원 약정서",
};

/**
 * 약속 데이터로부터 약정서 PDF를 생성하고 Base64 문자열로 반환합니다.
 * 서명란 근처에 "(서명)" 텍스트를 배치해 ModuSign의 anchor 기반 서명 필드 배치에 사용합니다.
 */
export function generatePledgePdfBase64(pledge) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
      doc.on("error", reject);

      const hasKoreanFont = fs.existsSync(REGULAR);
      if (hasKoreanFont) {
        doc.registerFont("Pretendard", REGULAR);
        doc.registerFont("Pretendard-Bold", BOLD);
      }
      const F = hasKoreanFont ? "Pretendard" : "Helvetica";
      const FB = hasKoreanFont ? "Pretendard-Bold" : "Helvetica-Bold";

      const title = TYPE_LABEL[pledge.type] || "기부 약정서";

      doc.font(FB).fontSize(20).fillColor("#16213E").text("Q.sight", { align: "left" });
      doc.moveDown(0.3);
      doc.font(FB).fontSize(22).fillColor("#16213E").text(title, { align: "left" });
      doc.moveDown(1);
      doc.strokeColor("#E2E5EE").lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
      doc.moveDown(1);

      doc.font(FB).fontSize(13).fillColor("#16213E").text("1. 본인 확인");
      doc.moveDown(0.4);
      doc.font(F).fontSize(11).fillColor("#333333").text(pledge.declaration || "-", { lineGap: 4 });
      doc.moveDown(1);

      doc.font(FB).fontSize(13).fillColor("#16213E").text("2. 약정 내용");
      doc.moveDown(0.4);

      const rows = [
        ["기부 유형", title.replace(/(약정서|신청서)$/, "").trim()],
        ["후원 대상", pledge.target || "-"],
        ["후원 금액", pledge.amount ? `${pledge.amount}` : "-"],
        ["후원 주기 / 기간", pledge.period || "-"],
        ["시작일", pledge.startDate || "-"],
        ["후원자", `${pledge.donorName || "-"} (${pledge.donorPhone || "-"})`],
      ];

      const startX = 56;
      let y = doc.y + 4;
      const rowHeight = 26;
      rows.forEach(([label, value], i) => {
        const bg = i % 2 === 0 ? "#F5F6FA" : "#FFFFFF";
        doc.rect(startX, y, 483, rowHeight).fill(bg);
        doc.fillColor("#5B6072").font(F).fontSize(10.5).text(label, startX + 12, y + 7, { width: 120 });
        doc.fillColor("#16213E").font(FB).fontSize(10.5).text(String(value), startX + 150, y + 7, { width: 320 });
        y += rowHeight;
      });
      doc.y = y + 20;

      if (pledge.extra) {
        doc.font(FB).fontSize(13).fillColor("#16213E").text("3. 추가 안내");
        doc.moveDown(0.4);
        doc.font(F).fontSize(11).fillColor("#333333").text(String(pledge.extra), { lineGap: 4 });
        doc.moveDown(1);
      }

      if (pledge.documentText) {
        doc.font(FB).fontSize(13).fillColor("#16213E").text("4. 약정 조항");
        doc.moveDown(0.4);
        doc.font(F).fontSize(10.5).fillColor("#333333").text(pledge.documentText, { lineGap: 5 });
        doc.moveDown(1.5);
      }

      // 서명란 - anchor 텍스트 "(서명)" 은 ModuSign 서명 필드 자동 배치 기준점
      doc.moveDown(2);
      doc.strokeColor("#E2E5EE").lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
      doc.moveDown(1);
      doc.font(F).fontSize(11).fillColor("#16213E").text(
        `위 내용에 동의하며 후원을 약정합니다.        ${new Date().toISOString().slice(0, 10)}`
      );
      doc.moveDown(1.2);
      doc.font(FB).fontSize(12).text(`후원자: ${pledge.donorName || "-"}       (서명)`);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
