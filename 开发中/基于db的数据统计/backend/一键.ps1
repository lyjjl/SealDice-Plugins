$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Checking and preparing Python environment..."

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

if (-Not (Test-Path -Path ".\venv")) {
    Write-Host "Virtual environment not found, creating..."
    try {
        python -m venv venv
        Write-Host "Virtual environment created successfully."
    }
    catch {
        Write-Host "Error: Failed to create virtual environment. Please ensure Python 3 is installed on your system."
        exit
    }
} else {
    Write-Host "Virtual environment found, skipping creation step."
}

Write-Host "Activating virtual environment..."
.\venv\Scripts\Activate.ps1

Write-Host "Checking if Flask is installed..."
$isFlaskInstalled = (pip list --format freeze | Select-String -Pattern "Flask")
if (-Not $isFlaskInstalled) {
    Write-Host "Flask not installed, installing..."
    try {
        pip install Flask
        Write-Host "Flask installed successfully."
    }
    catch {
        Write-Host "Error: Flask installation failed."
        exit
    }
} else {
    Write-Host "Flask is already installed, skipping installation step."
}

Write-Host "Running main.py..."
if (Test-Path -Path ".\main.py") {
    python .\main.py
} else {
    Write-Host "Error: main.py file not found. Please ensure the file is in the same directory as this script."
    Write-Host "Script has exited."
}
