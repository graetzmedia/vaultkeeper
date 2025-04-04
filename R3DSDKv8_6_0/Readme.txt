Welcome to v8.6.0 of the Mac, Windows & Linux R3D SDK!

For any feedback, bugs or questions please contact r3dsdk@red.com


Important 8.6 notes
-----------------------------------------------------------
NOTE: this will be the last major SDK release with 32-bit support
NOTE: 12 GB minimum VRAM recommended for GPU
NOTE: Metal requires v2.3 and uses ARC (Automatic Reference Counting)


What's new for the 8.6.0 release
-----------------------------------------------------------
The 8.6.0 release contains these changes:
- Added: Broadcast image processing pipe for clips recorded in Broadcast mode. See "Broadcast Image Pipeline.txt" for more information.
- Added: Extended Highlights General Release - Improved quality and performance.
- Deprecated: 32-bit support. Will be removed in the next major SDK release.
- Improved: R3DStream2 class now allows setting the R3D file size between 4 GB (the default) and 1 TB (max).
- Added: OPTION_DELAY_GPU_COMPILE flag for InitializeSdk() to delay OpenCL kernel compilation from REDCL::checkCompatability() to on-demand.
- Added: RMD_BROADCAST_SETTINGS, RMD_EXTERNAL_TALLY & RMD_EXTERNAL_TALLY_COLOR metadata (see R3DSDKMetadata.h).
- Removed: Rocket(-X) support, including the AsyncDecoder::Open()'s enableAutoRRX parameter, R3DDecoder::useRRXAsync field & DECODE_ROCKET_CUSTOM_RES enum.
- Removed: VideoDecodeJob::BytesPerRow field & DSBytesPerRowInvalid enum as this feature has not worked for a long time.
- Changed: AsyncDecompressJob::Callback must be set to a valid callback function. Null will result in DSInvalidParameter being returned.
- Changed: ImageProcessingLimits::ISODefault to 800.
- Changed: Linux minimum GLIBC & GLIBCXX versions to 2.14 & 3.4.21 respectively.
- Changed: minimum supported Metal version is now 2.3.
- Changed: REDCuda functions now return REDCuda::Status_InvalidJobParameter_deviceId if deviceID it is out of bounds.

The 8.6.0 release contains bug fixes for:
- Fixed: unclosed clips could fail to load in rare occasions.
- Fixed: deviceID passed into REDCuda functions was not being used. SDK now calls cudaSetDevice() with this value.


Additional links
-----------------------------------------------------------
Sample R3D clips: http://www.red.com/sample-r3d-files
Broadcast: https://downloads.red.com/software/sdk/R3D/Broadcast_sample_clip.zip

RED LUT KITS:
- https://www.red.com/download/3d-cude-luts-and-ipp2
- https://www.red.com/download/red-lut-kit

REDCINE-X PRO, REDline & more:
- https://www.red.com/download/redcine-x-pro-win & https://www.red.com/download/redcine-x-pro-win-beta
- https://www.red.com/download/redcine-x-pro-mac & https://www.red.com/download/redcine-x-pro-mac-beta
- https://www.red.com/download/redline-linux-beta 
- https://www.red.com/downloads


Introduction
-----------------------------------------------------------
The R3D SDK contains the following functionality:

- Compatible with DSMC3 firmware up to build 1.7.X
- Compatible with all DSMC/DSMC2 firmware
- Compatible with all RED ONE firmware
- Opening of R3D clips (consisting of one or more R3D files)
- Extracting clip properties and associated metadata
- Decoding video frames at various resolutions, qualities & with different image & HDR processing settings
- Decoding of audio samples and audio blocks
- Assistance for getting the right options & ranges for the image processing into your User Interface
- Auto White Balance from a user selectable point
- RMD sidecar support to update a clips look and have it stay with the clip
- 3D LUT (CUBE) sidecar support
- Single or multi-GPU processing through CUDA, Metal or OpenCL


Hardware acceleration requirements
-----------------------------------------------------------
- CUDA: CUDA 6.5 runtime or higher, GPU compute capability 3.0 or higher
- OpenCL: 1.1 or higher. CPU OpenCL devices not supported
- Metal: v2.3 or higher, acOS 10.11 minimum, 10.14 or higher recommended for concurrent dispatch support
- Minimum of 8 GB of graphics card memory, 12 GB or more recommended
- NOTE: GPU acceleration is not available for HDRx blending or ColorVersion1
- NOTE: GPU decode (decompression) support not available for RED ONE clips
- NOTE: GPU decompression, Metal image processing & Extended Highlights not supported by R3DDecoder


What is included
-----------------------------------------------------------
- Broadcast Image Pipeline.txt        : more detail information about the broadcast image processing pipe available for clips shot in broadcast mode
- How to use the SDK.txt              : how to use the SDK, installation & building your application
- IPP2 How to use.txt                 : how to use the newer IPP2 image processing pipe
- IPP2 Image Pipeline Stages.pdf      : high level overview of the IPP2 image processing pipe, its goals and the parts that make up IPP2
- OpenCL kernel caching.txt           : tips on avoiding lengthy OpenCL startup delays due to kernel compilation
- R3D SDK readme.txt                  : this document
- Release history.txt                 : release notes for all versions released
- SDK License Agreement.pdf           : license agreement for the R3D SDK
- White Paper on RWG and Log3G10.pdf  : White paper on and definitions for REDWideGamutRGB and Log3G10
- Include\R3DSDK.h                    : include this first to get access to R3D loading and procesing
- Include\R3DSDKCuda.h                : include to use RED CUDA processing in your existing CUDA pipeline
- Include\R3DSDKCustomIO.h            : include to replace the SDK I/O back-end with a custom implementation
- Include\R3DSDKDecoder.h             : include to use RED managed GPU processing using either CUDA or OpenCL
- Include\R3DSDKDefinitions.h         : various definitions (no need to directly include this as R3DSDK.h does so)
- Include\R3DSDKMetadata.h            : metadata definitions (no need to directly include this as R3DSDK.h does so)
- Include\R3DSDKMetal.h               : include to use RED Metal  processing in your existing Apple Metal pipeline
- Include\R3DSDKOpenCL.h              : include to use RED OpenCL processing in your existing OpenCL pipeline
- Include\R3DSDKStream.h              : include to process incoming camera network stream and save to R3D clips
- Lib\linux32\libR3DSDK*.a            : Linux 32-bit Intel static libraries that must be linked to your project.
- Lib\linux64\libR3DSDK*.a            : Linux 64-bit Intel static libraries that must be linked to your project.
- Lib\mac64\libR3DSDK-libcpp.a        : Mac Universal 64-bit Intel/Apple Silicon static library that must be linked to your project.
- Lib\win32\R3DSDK-*.lib              : Windows 32-bit Intel static libraries that must be linked to your project.
- Lib\win64\R3DSDK-*.lib              : Windows 64-bit Intel static libraries that must be linked to your project.
- Redistributable\linux\              : Dynamic libraries (.so) you must distribute with your Linux application
- Redistributable\mac\                : Dynamic libraries (.dylib) you must distribute with your macOS application
- Redistributable\win\                : Dynamic libraries (.DLL) you must distribute with your Windows application
- Sample code\Audio decode\           : decode audio in two different ways
- Sample code\Clip info and metadata\ : get clip properties & metadata and check files for CRC errors
- Sample code\CPU decoding\           : basic CPU only decoding, image processing and HDRx blending
- Sample code\Creating clips\         : create new shorter R3D clips and stream compressed R3D data from a camera over the network
- Sample code\Custom IO\              : replace the SDK I/O back-end with a custom implementation
- Sample code\GPU decoding\           : CUDA, OpenCL and Metal GPU accelerated decoding
- Sample code\GetSdkVersionSample.cpp : simple example to initialize SDK & display version information (good to info to log!)


Copyright
-----------------------------------------------------------------
The R3D SDK and all included materials (including header files, libraries,
sample code & documentation) are Copyright (C) 2008-2024 RED Digital Cinema.
All rights reserved. All trademarks are the property of their respective owners.

This software was developed using KAKADU software.
