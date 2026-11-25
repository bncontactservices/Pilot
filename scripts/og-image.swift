// Génère public/images/og.png (1200×630), l'image d'aperçu des partages (Open Graph).
// macOS seulement (AppKit). Usage : swiftc -O scripts/og-image.swift -o /tmp/og && /tmp/og "$(pwd)" public/images/og.png
// Les polices sont celles de @fontsource (fichiers WOFF) ; à défaut, des polices système.
import AppKit
import CoreText

let args = CommandLine.arguments
let racine = args[1], sortie = args[2]

// Polices du produit (fichiers WOFF de @fontsource) : on tente de les enregistrer, sinon polices système.
func enregistrer(_ chemin: String) -> Bool {
    var erreur: Unmanaged<CFError>?
    return CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: chemin) as CFURL, .process, &erreur)
}
let okSans = enregistrer("\(racine)/node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff")
let okSerif = enregistrer("\(racine)/node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-italic.woff")
print("woff sans:", okSans, "serif:", okSerif)

func police(_ noms: [String], _ taille: CGFloat, repli: NSFont) -> NSFont {
    for n in noms { if let f = NSFont(name: n, size: taille) { return f } }
    return repli
}
let sansGras = police(["PlusJakartaSans-ExtraBold", "Plus Jakarta Sans ExtraBold", "Plus Jakarta Sans"], 66, repli: .systemFont(ofSize: 66, weight: .heavy))
let sansMoyen = police(["PlusJakartaSans-Medium", "Plus Jakarta Sans"], 30, repli: .systemFont(ofSize: 30, weight: .medium))
let serif = police(["CormorantGaramond-SemiBoldItalic", "Cormorant Garamond SemiBold Italic", "Cormorant Garamond"], 76, repli: NSFont(name: "Georgia-Italic", size: 76)!)
print("polices:", sansGras.fontName, serif.fontName)

let L = 1200, H = 630
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: L, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

let navy = NSColor(srgbRed: 0x0B/255, green: 0x25/255, blue: 0x45/255, alpha: 1)
let emeraude = NSColor(srgbRed: 0x12/255, green: 0xB8/255, blue: 0x86/255, alpha: 1)
navy.setFill(); NSRect(x: 0, y: 0, width: L, height: H).fill()

// Lueur émeraude en haut à droite
let degrade = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [emeraude.withAlphaComponent(0.30).cgColor, emeraude.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(degrade, startCenter: CGPoint(x: 1050, y: 560), startRadius: 0, endCenter: CGPoint(x: 1050, y: 560), endRadius: 520, options: [])

// Grille discrète
ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.04).cgColor); ctx.setLineWidth(1)
for x in stride(from: 0, to: L, by: 56) { ctx.move(to: CGPoint(x: x, y: 0)); ctx.addLine(to: CGPoint(x: x, y: H)) }
for y in stride(from: 0, to: H, by: 56) { ctx.move(to: CGPoint(x: 0, y: y)); ctx.addLine(to: CGPoint(x: L, y: y)) }
ctx.strokePath()

// Monogramme (jauge segmentée), repère 32×32 agrandi
ctx.saveGState()
ctx.translateBy(x: 80, y: CGFloat(H) - 80 - 88); ctx.scaleBy(x: 88.0/32.0, y: 88.0/32.0)
let carre = CGPath(roundedRect: CGRect(x: 0, y: 0, width: 32, height: 32), cornerWidth: 9, cornerHeight: 9, transform: nil)
ctx.setFillColor(NSColor(srgbRed: 0x13/255, green: 0x33/255, blue: 0x5C/255, alpha: 1).cgColor); ctx.addPath(carre); ctx.fillPath()
ctx.setLineWidth(3.2); ctx.setLineCap(.round)
func arc(_ a0: CGFloat, _ a1: CGFloat, _ couleur: CGColor) {
    ctx.setStrokeColor(couleur)
    ctx.addArc(center: CGPoint(x: 16, y: 13), radius: 9, startAngle: a0 * .pi / 180, endAngle: a1 * .pi / 180, clockwise: false)
    ctx.strokePath()
}
arc(140, 180, NSColor.white.withAlphaComponent(0.35).cgColor)
arc(66, 118, NSColor.white.withAlphaComponent(0.65).cgColor)
arc(0, 56, emeraude.cgColor)
ctx.setStrokeColor(NSColor.white.cgColor); ctx.setLineWidth(2)
ctx.move(to: CGPoint(x: 16, y: 13)); ctx.addLine(to: CGPoint(x: 21, y: 17.2)); ctx.strokePath()
ctx.setFillColor(NSColor.white.cgColor); ctx.fillEllipse(in: CGRect(x: 14.2, y: 11.2, width: 3.6, height: 3.6))
ctx.restoreGState()

func dessiner(_ texte: NSAttributedString, dans r: NSRect) { texte.draw(with: r, options: [.usesLineFragmentOrigin]) }
let blanc = NSColor.white
let policePilot = police(["PlusJakartaSans-ExtraBold", "Plus Jakarta Sans"], 52, repli: .systemFont(ofSize: 52, weight: .heavy))
let motPilot = NSAttributedString(string: "Pilot", attributes: [.font: policePilot, .foregroundColor: blanc])
let yMarque = CGFloat(H) - 80 - 70
dessiner(motPilot, dans: NSRect(x: 190, y: yMarque, width: 300, height: 70))
dessiner(NSAttributedString(string: "M&E", attributes: [.font: NSFont.monospacedSystemFont(ofSize: 48, weight: .medium), .foregroundColor: emeraude]), dans: NSRect(x: 190 + motPilot.size().width + 14, y: yMarque - 5, width: 200, height: 70))

// Titre en trois lignes, « fiables » en serif italique émeraude
let titre = NSMutableAttributedString()
let styleLigne = NSMutableParagraphStyle(); styleLigne.lineSpacing = 4
func ajouter(_ s: String, _ f: NSFont, _ c: NSColor) { titre.append(NSAttributedString(string: s, attributes: [.font: f, .foregroundColor: c, .paragraphStyle: styleLigne])) }
ajouter("Pilotez vos projets avec\ndes données ", sansGras, blanc)
ajouter("fiables", serif, emeraude)
ajouter(",\nen temps réel.", sansGras, blanc)
dessiner(titre, dans: NSRect(x: 80, y: 120, width: 1040, height: 330))

dessiner(NSAttributedString(string: "Suivi-évaluation pour les ONG, PME et projets bailleurs", attributes: [.font: sansMoyen, .foregroundColor: blanc.withAlphaComponent(0.8)]), dans: NSRect(x: 80, y: 56, width: 1040, height: 44))

NSGraphicsContext.restoreGraphicsState()
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: sortie))
print("écrit", sortie, png.count)
