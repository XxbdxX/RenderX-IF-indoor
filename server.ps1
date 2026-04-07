$ErrorActionPreference = "Stop"

function Start-SimpleHttpServer {
    param([string]$Port = "8080", [string]$RootDir = "D:\CODE\RenderX-IF")
    
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
    
    Write-Host "=========================================="
    Write-Host "RenderX Server started at http://localhost:$Port"
    Write-Host "Press Ctrl+C to stop the server"
    Write-Host "=========================================="
    
    try {
        while ($true) {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $urlPath = $request.Url.AbsolutePath
            if ($urlPath -eq "/") {
                $urlPath = "/index.html"
            }
            
            $filePath = Join-Path $RootDir $urlPath.Replace("/", "\")
            
            if (Test-Path $filePath -PathType Leaf) {
                $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mimeTypes = @{
                    ".html" = "text/html; charset=utf-8"
                    ".css" = "text/css; charset=utf-8"
                    ".js" = "application/javascript; charset=utf-8"
                    ".json" = "application/json"
                    ".png" = "image/png"
                    ".jpg" = "image/jpeg"
                    ".jpeg" = "image/jpeg"
                    ".svg" = "image/svg+xml"
                    ".txt" = "text/plain"
                }
                
                $contentType = $mimeTypes[$ext]
                if ($null -eq $contentType) {
                    $contentType = "application/octet-stream"
                }
                
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $errorHtml = "<html><body><h1>404 - File Not Found</h1><p>$urlPath</p></body></html>"
                $errorBytes = [System.Text.Encoding]::UTF8.GetBytes($errorHtml)
                $response.ContentLength64 = $errorBytes.Length
                $response.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
            }
            
            $response.Close()
        }
    }
    finally {
        $listener.Stop()
        $listener.Close()
        Write-Host "Server stopped"
    }
}

Start-SimpleHttpServer -Port 8080
