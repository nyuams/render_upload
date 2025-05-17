//app.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const PKPass = require('passkit-generator').PKPass;
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));  // Increased limit for base64 images
app.use(express.urlencoded({ extended: true }));
app.use('/passes', express.static('temp'));

// Enable CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Helper function to parse RGB color
function parseRGBColor(rgbString) {
    const matches = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!matches) return { r: 41, g: 128, b: 185 }; // Default sky blue color
    return {
        r: parseInt(matches[1]),
        g: parseInt(matches[2]),
        b: parseInt(matches[3])
    };
}

// Helper function to format address with first part on first line and rest on second line
function formatAddress(address) {
    if (!address) return '';
    
    // Remove USA from the end if present
    let formattedAddress = address.replace(/,\s*USA$/i, '');
    
    // Find the position of the first comma
    const firstCommaIndex = formattedAddress.indexOf(',');
    
    if (firstCommaIndex !== -1) {
        // Extract the part before the first comma for the first line
        const firstLine = formattedAddress.substring(0, firstCommaIndex).trim();
        // Extract the rest for the second line
        const secondLine = formattedAddress.substring(firstCommaIndex + 1).trim();
        
        // Return formatted address with a line break
        return `${firstLine}\n${secondLine}`;
    }
    
    // If no comma found, return the original address (without USA)
    return formattedAddress;
}

// Helper function to format duration
function formatDuration(minutes) {
    if (!minutes || isNaN(minutes)) return '';
    
    // Convert to number if it's a string
    minutes = parseInt(minutes);
    
    if (minutes < 60) {
        return `${minutes} min`;
    } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (remainingMinutes === 0) {
            return `${hours} hr`;
        } else {
            return `${hours} hr ${remainingMinutes} min`;
        }
    }
}

// Image processing function
async function processStripImage(inputPath, backgroundColor) {
    const outputDir = '/tmp';
    const shadowColor = parseRGBColor(backgroundColor);
    
    try {
        // Generate three resolutions
        await sharp(inputPath)
            .resize(375, 123, { fit: 'cover' })
            .modulate({ brightness: 0.7 })
            .png()
            .toFile(path.join(outputDir, 'strip.png'));

        await sharp(inputPath)
            .resize(750, 246, { fit: 'cover' })
            .composite([{
                input: {
                    create: {
                        width: 750,
                        height: 246,
                        channels: 4,
                        background: { ...shadowColor, alpha: 0.5 }
                    }
                },
                blend: 'over'
            }])
            .png()
            .toFile(path.join(outputDir, 'strip@2x.png'));

        await sharp(inputPath)
            .resize(1125, 369, { fit: 'cover' })
            .composite([{
                input: {
                    create: {
                        width: 1125,
                        height: 369,
                        channels: 4,
                        background: { ...shadowColor, alpha: 0.5 }
                    }
                },
                blend: 'over'
            }])
            .png()
            .toFile(path.join(outputDir, 'strip@3x.png'));

        return {
            strip: path.join(outputDir, 'strip.png'),
            strip2x: path.join(outputDir, 'strip@2x.png'),
            strip3x: path.join(outputDir, 'strip@3x.png')
        };
    } catch (error) {
        throw new Error(`Image processing failed: ${error.message}`);
    }
}

// Cleanup function
function cleanupFiles(files) {
    files.forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });
}

// Main pass generation endpoint
app.post('/generate-pass', async (req, res) => {
    const filesToCleanup = [];
    
    try {
        // Extract fields from request
        const {
            appointmentDate,
            appointmentTime,
            appointmentType,
            clientName,
            providerName,
            location,
            fullAddress,
            notes,
            backgroundColor,
            latitude,
            longitude,
            notificationTime,
            stripImage,  // Extract strip image data
            duration     // New duration field
        } = req.body;
        
        // Generate unique ID and download URL
        const uniqueId = Date.now().toString();
        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;

        // Process strip image if provided
        let stripImages = null;
        if (stripImage && stripImage.base64Data) {
            // Create a temporary file path
            const tmpFilePath = path.join('/tmp', `${uniqueId}-strip-image.jpg`);
            filesToCleanup.push(tmpFilePath);
            
            // Write the base64 data to a file
            fs.writeFileSync(tmpFilePath, Buffer.from(stripImage.base64Data, 'base64'));
            
            // Process the strip image
            stripImages = await processStripImage(tmpFilePath, backgroundColor || "rgb(41, 128, 185)");
            if (stripImages) {
                Object.values(stripImages).forEach(path => filesToCleanup.push(path));
            }
        }

        // Read and update pass.json
        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
        
        // Update serial number
        passJson.serialNumber = uniqueId;
        
        // Update barcode with download URL
        passJson.barcode = {
            message: downloadUrl,
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1",
            altText: "Scan for appointment"
        };
        
        // Add suppress strip shine property
        passJson.suppressStripShine = true;
        
        // Calculate appointment date and time
        let appointmentDateTime;
        if (appointmentDate && appointmentTime) {
            appointmentDateTime = new Date(appointmentDate);
            const timeDate = new Date(appointmentTime);
            appointmentDateTime.setHours(timeDate.getHours(), timeDate.getMinutes());
        } else if (appointmentDate) {
            appointmentDateTime = new Date(appointmentDate);
        }
        
        // Calculate notification time using notificationTime from request (minutes before appointment)
        if (appointmentDateTime) {
            const relevantDateTime = new Date(appointmentDateTime);
            // Subtract the specified number of minutes (or default to 15 minutes if not provided)
            const minutesBefore = typeof notificationTime === 'number' ? notificationTime : 15;
            relevantDateTime.setMinutes(relevantDateTime.getMinutes() - minutesBefore);
            passJson.relevantDate = relevantDateTime.toISOString();
        }
        
        // Ensure locations are set with provided lat/long or defaults
        passJson.locations = [
            {
                latitude: latitude || 40.7313,
                longitude: longitude || -74.0627,
                relevantText: `Your ${appointmentType || 'appointment'} at ${location || 'the office'} is now.`
            }
        ];
        
        // Add barcodes array for newer iOS versions
        passJson.barcodes = [{
            message: downloadUrl,
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1",
            altText: "Scan for appointment"
        }];

        // Set background color if provided
        if (backgroundColor) {
            passJson.backgroundColor = backgroundColor;
        }

        // Update appointment date if provided
        if (appointmentDate) {
            passJson.eventTicket.headerFields[0].value = new Date(appointmentDate).toISOString();
        }

        // Update appointment type if provided
        if (appointmentType) {
            passJson.eventTicket.primaryFields[0].value = appointmentType;
        }

        // Update appointment time if provided
        if (appointmentTime) {
            passJson.eventTicket.secondaryFields[0].value = new Date(appointmentTime).toISOString();
        }

        // Update location if provided - format with first part on first line
        if (location) {
            passJson.eventTicket.secondaryFields[1].value = formatAddress(location);
        }

        // Update client name if provided
        if (clientName) {
            passJson.eventTicket.auxiliaryFields[0].value = clientName;
        }

        // Update provider name if provided
        if (providerName) {
            passJson.eventTicket.auxiliaryFields[1].value = providerName;
        }
        
        // Add a new field for duration if provided
        if (duration) {
            // Add duration as a new auxiliaryField if it doesn't exist already
            const durationField = {
                key: "duration",
                label: "DURATION",
                value: formatDuration(duration)
            };
            
            // Check if a duration field already exists
            const durationFieldIndex = passJson.eventTicket.auxiliaryFields.findIndex(field => field.key === 'duration');
            
            if (durationFieldIndex !== -1) {
                // Update existing field
                passJson.eventTicket.auxiliaryFields[durationFieldIndex] = durationField;
            } else {
                // Add new field
                passJson.eventTicket.auxiliaryFields.push(durationField);
            }
        }

        // Update full address if provided
        if (fullAddress) {
            passJson.eventTicket.backFields[0].value = formatAddress(fullAddress);
        }

        // Update notes if provided, otherwise keep default
        if (notes) {
            passJson.eventTicket.backFields[1].value = notes;
        }

        // Update directions with latitude and longitude
        const directionsLat = latitude || 40.7282544;
        const directionsLng = longitude || -73.9932413;
        const encodedLocation = encodeURIComponent("Meeting Point");
        passJson.eventTicket.backFields[2].value = `https://maps.apple.com/?ll=${directionsLat},${directionsLng}&q=${encodedLocation}`;

        // Prepare model files
        const modelFiles = {
            'pass.json': Buffer.from(JSON.stringify(passJson)),
            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png')),
            'logo.png': fs.readFileSync(path.join(__dirname, 'models/logo.png')),
            'logo@2x.png': fs.readFileSync(path.join(__dirname, 'models/logo@2x.png'))
        };

        // Add strip images if they were processed
        if (stripImages) {
            modelFiles['strip.png'] = fs.readFileSync(stripImages.strip);
            modelFiles['strip@2x.png'] = fs.readFileSync(stripImages.strip2x);
            modelFiles['strip@3x.png'] = fs.readFileSync(stripImages.strip3x);
        }

        // Create pass instance
        const pass = new PKPass(modelFiles, {
            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
            signerKeyPassphrase: 'mysecretphrase'
        });

        // Generate pass buffer
        const buffer = pass.getAsBuffer();
        
        // Ensure temp directory exists and save pass
        await fs.promises.mkdir('temp', { recursive: true });
        const passPath = path.join('temp', `${uniqueId}.pkpass`);
        await fs.promises.writeFile(passPath, buffer);

        // Clean up temporary files
        cleanupFiles(filesToCleanup);

        // Send response
        res.json({
            success: true,
            passUrl: downloadUrl,
            passId: uniqueId,
            notificationTime: passJson.relevantDate
        });
    } catch (error) {
        // Clean up files in case of error
        cleanupFiles(filesToCleanup);
        
        console.error('Error details:', error);
        res.status(500).json({
            error: 'Failed to generate pass',
            details: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
