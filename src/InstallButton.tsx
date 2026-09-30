import { Download } from 'lucide-react'
export default function InstallButton({ className = 'secondary-button', label = 'Download app' }: { className?: string; label?: string }) { return <button className={className} onClick={() => window.alert('Use your browser menu and choose “Install app” or “Add to home screen”.')}><Download size={14} /> {label}</button> }
