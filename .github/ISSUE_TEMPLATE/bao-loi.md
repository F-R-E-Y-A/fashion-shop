---
name: Báo lỗi
about: Một lỗi tái hiện được; đi theo vòng đời ở docs/shared/testing.md
title: 'Bug PH-NN: <hành vi sai, một câu>'
labels: 'bug'
assignees: ''
---

## Mức độ

<!-- Gắn đúng một nhãn: severity/critical (mất tiền, mất dữ liệu, chặn luồng mua), severity/major (sai nghiệp vụ, có đường vòng), severity/minor (hiển thị, thông báo sai) -->
Mức: 
Use case / AC bị vi phạm: UC-NN.m/ACk (hoặc "chưa có AC" — thêm AC khi sửa)

## Tái hiện

1. 
2. 

Môi trường: local / staging · commit: 

## Mong đợi

## Thực tế

<!-- Dán thông báo lỗi, mã HTTP, ảnh chụp. Không dán token, mật khẩu, dữ liệu khách thật. -->

## Sửa

- [ ] Bài tái hiện viết trước, chạy thấy đỏ: `<tệp>:<dòng>`
- [ ] Pull request ghi `Closes #<số>`, nhãn `regression-test`
- [ ] `npm run check` xanh; bài tái hiện xanh sau khi sửa
