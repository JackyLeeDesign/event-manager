# 活動報名管理 MVP

這一版是「Google Form + Google Sheet + Apps Script Web App」的輕量流程。

## 使用流程

- 使用者先輸入「參加蓮友姓名 + 手機」。
- 法名改為選填：使用者先選是否有法名，選「有」才需要輸入法名。
- 系統查無既有資料：顯示「開始新報名」，前往已預填 key 欄位的 Google Form。
- 系統找到既有資料：顯示「開啟修改表單」，前往該筆 Google Form 編輯連結。
- 系統找到 2 筆以上資料：提示同名同手機有多筆報名，請聯繫管理員。
- 新報名、重新報名、取消報名等欄位由 Google Form 內部自行設定與保存。

## 已依目前欄位設定

主要資料表：

- Google Sheet ID：`1OpY8f4kVncwmATe9X8qZ-ibGj64TnwkeHv1CPrpkOYc`
- 工作表：`表單回覆 2`
- key：`參加蓮友姓名 + 手機`

系統會自動補上這些欄位：

- `系統Key`
- `修改連結`

## 部署步驟

1. 到 Google Sheet 或 Google Form 開 Apps Script。
2. 建立 `Code.gs`，貼上 `apps-script/Code.gs`。
3. 建立 HTML 檔案 `Index`，貼上 `apps-script/Index.html`。
4. 建立 HTML 檔案 `Admin`，貼上 `apps-script/Admin.html`。
5. 如果有顯示專案資訊清單，貼上 `apps-script/appsscript.json`。
6. 在 Apps Script 新增觸發器：

   - 函式：`onFormSubmit`
   - 事件來源：表單
   - 事件類型：表單提交時

   這個觸發器建議從 Google Form 綁定的 Apps Script 專案設定，因為程式需要 `e.response.getEditResponseUrl()` 取得修改連結。

7. 部署為網頁應用程式：

   - 執行身分：我
   - 存取權：知道連結的任何人

8. 打開管理後台：

   ```text
   你的 Web App 網址?page=admin
   ```

9. 初次管理密碼是：

   ```text
   admin-change-me
   ```

10. 在管理後台填入 Google Form 編輯 ID 或編輯網址，並立刻改掉管理密碼。
11. 按「補寫既有修改連結」，授權後會把既有回覆的 edit response URL 補回 Sheet。

## 管理者日常操作

未來新增表單或活動時，管理者不用改程式。

1. 建立新的 Google Form。
2. 確認 Form 回覆有連到 Google Sheet。
3. 到管理後台更新：

   - Google Sheet ID
   - 回覆工作表名稱
   - Google Form 編輯 ID 或編輯網址
   - 公開填寫連結
   - Key 欄位名稱
   - 管理員聯絡電話

4. 儲存設定。
5. 按「補寫既有修改連結」。
6. 把前台 Web App 網址提供給使用者。

## 預填新報名資料

使用者在前台輸入資料後，如果系統查不到既有資料，會產生 Google Form 的預填連結。

目前會預填：

- `參加蓮友姓名`
- `法名`，使用者有填才會預填
- `手機`

Google Form 題目標題需要和後台設定的欄位名稱一致，且題型需為簡答或段落文字。

## 後台網址

前台網址就是部署後的 Web App URL。

後台網址是在同一個網址後面加：

```text
?page=admin
```

## Google Form ID 說明

管理後台的「Google Form 編輯 ID 或編輯網址」不能用公開填寫連結裡 `/d/e/.../viewform` 的 ID。

請使用表單編輯網址：

```text
https://docs.google.com/forms/d/FORM_ID/edit
```

你可以貼整段編輯網址，系統會自動取出 `FORM_ID`。

## 管理密碼

因為前台 Web App 會開給使用者，後台也在同一個 Web App 裡，所以管理頁需要管理密碼。

初次密碼是：

```text
admin-change-me
```

## 注意

第一次進入後台後，請立刻改成自己的管理密碼。
