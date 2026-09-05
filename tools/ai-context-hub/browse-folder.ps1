Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = "เลือกโฟลเดอร์สำหรับ AI Context Hub"
$dlg.ShowNewFolderButton = $true
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$res = $dlg.ShowDialog($topForm)
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [System.Console]::WriteLine($dlg.SelectedPath)
}
