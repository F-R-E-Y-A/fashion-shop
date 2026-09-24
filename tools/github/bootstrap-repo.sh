#!/usr/bin/env bash
# tools/github/bootstrap-repo.sh — chay MOT LAN sau khi day kho len GitHub: nhan va milestone theo sprint.
# Dung: bash tools/github/bootstrap-repo.sh F-R-E-Y-A/fashion-shop
set -euo pipefail
REPO="${1:-F-R-E-Y-A/fashion-shop}"

label() {
  gh label create "$1" -R "$REPO" --color "$2" --description "$3" --force >/dev/null && echo "nhan       $1"
}
label "bug"               "d73a4a" "Loi da xac nhan"
label "severity/critical" "b60205" "Chan luong chinh hoac mat du lieu, sua ngay"
label "severity/major"    "e99695" "Sai nghiep vu, co cach di vong"
label "severity/minor"    "fbca04" "Kho chiu, khong chan"
label "ai-error"          "5319e7" "Loi do AI sinh, ghi vao docs/ai-log/hallucinations.md"
label "tech-debt"         "c5def5" "No ky thuat, xem docs/TECH_DEBT.md"
label "regression-test"   "0e8a16" "PR sua loi co kem test hoi quy"
label "ph"                "1d76db" "Phan he chuc nang"
label "ht"                "0052cc" "Hang muc nen tang"

# Milestone moi sprint, ten theo docs/GIT_FLOW.md, han la Chu Nhat hop giang vien.
ms() {
  if gh api -X POST "repos/$REPO/milestones" -f title="$1" -f due_on="$2T12:00:00Z" >/dev/null 2>&1; then
    echo "milestone  $1"
  else
    echo "milestone  $1 (da co hoac loi, bo qua)"
  fi
}
ms "S1 · 14/09 - 20/09" "2026-09-20"
ms "S2 · 21/09 - 27/09" "2026-09-27"
ms "S3 · 28/09 - 04/10" "2026-10-04"
ms "S4 · 05/10 - 11/10" "2026-10-11"
ms "S5 · 12/10 - 18/10" "2026-10-18"
ms "S6 · 19/10 - 25/10" "2026-10-25"
ms "S7 · 26/10 - 01/11" "2026-11-01"
ms "S8 · 02/11 - 08/11" "2026-11-08"
ms "S9 · 09/11 - 15/11" "2026-11-15"
ms "S10 · 16/11 - 22/11" "2026-11-22"
ms "S11 · 23/11 - 29/11" "2026-11-29"
echo "xong."
