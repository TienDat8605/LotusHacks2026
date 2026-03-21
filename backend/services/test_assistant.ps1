param(
  [string]$BaseUrl = "http://localhost:8090",
  [string]$Query = "I want a chill coffeeshop"
)

Write-Host "Health check..."
Invoke-RestMethod "$BaseUrl/healthz"

Write-Host "`nRetrieval-only test..."
$searchBody = @{ query = $Query; topK = 5 } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/assistant/test-search" `
  -ContentType "application/json" `
  -Body $searchBody | ConvertTo-Json -Depth 8

Write-Host "`nFull chat test..."
$chatBody = @{ threadId = "debug"; text = $Query } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/assistant/messages" `
  -ContentType "application/json" `
  -Body $chatBody | ConvertTo-Json -Depth 8
