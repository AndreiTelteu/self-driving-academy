import{t as e}from"./shaderStore-D-XQlhUT.js";import{d as t,f as n,m as r,p as i}from"./browser-B9Ruuc1o.js";var a=`bonesDeclaration`,o=`#if NUM_BONE_INFLUENCERS>0
#ifndef USE_VERTEX_PULLING
attribute matricesIndices : vec4f;attribute matricesWeights : vec4f;
#if NUM_BONE_INFLUENCERS>4
attribute matricesIndicesExtra : vec4f;attribute matricesWeightsExtra : vec4f;
#endif
#endif
#ifndef BAKED_VERTEX_ANIMATION_TEXTURE
#ifdef BONETEXTURE
var boneSampler : texture_2d<f32>;uniform boneTextureInfo : vec2f;
#else
uniform mBones : array<mat4x4f,BonesPerMesh>;
#endif
#ifdef BONES_VELOCITY_ENABLED
uniform mPreviousBones : array<mat4x4f,BonesPerMesh>;
#endif
#ifdef BONETEXTURE
fn readMatrixFromRawSampler(smp : texture_2d<f32>,index : f32)->mat4x4f
{let offset=i32(index)*4; 
let textureWidth=i32(uniforms.boneTextureInfo.x);let y=offset/textureWidth;let x=offset % textureWidth;let m0=textureLoad(smp,vec2<i32>(x+0,y),0);let m1=textureLoad(smp,vec2<i32>(x+1,y),0);let m2=textureLoad(smp,vec2<i32>(x+2,y),0);let m3=textureLoad(smp,vec2<i32>(x+3,y),0);return mat4x4f(m0,m1,m2,m3);}
#endif
#endif
#endif
`;e.IncludesShadersStoreWGSL[a]||(e.IncludesShadersStoreWGSL[a]=o);var s={name:a,shader:o},c=`clipPlaneVertexDeclaration`,l=`#ifdef CLIPPLANE
uniform vClipPlane: vec4<f32>;varying fClipDistance: f32;
#endif
#ifdef CLIPPLANE2
uniform vClipPlane2: vec4<f32>;varying fClipDistance2: f32;
#endif
#ifdef CLIPPLANE3
uniform vClipPlane3: vec4<f32>;varying fClipDistance3: f32;
#endif
#ifdef CLIPPLANE4
uniform vClipPlane4: vec4<f32>;varying fClipDistance4: f32;
#endif
#ifdef CLIPPLANE5
uniform vClipPlane5: vec4<f32>;varying fClipDistance5: f32;
#endif
#ifdef CLIPPLANE6
uniform vClipPlane6: vec4<f32>;varying fClipDistance6: f32;
#endif
`;e.IncludesShadersStoreWGSL[c]||(e.IncludesShadersStoreWGSL[c]=l);var u={name:c,shader:l},d=`fogVertexDeclaration`,f=`#ifdef FOG
varying vFogDistance: vec3f;
#endif
`;e.IncludesShadersStoreWGSL[d]||(e.IncludesShadersStoreWGSL[d]=f);var p={name:d,shader:f},m=`bonesVertex`,h=`#ifndef BAKED_VERTEX_ANIMATION_TEXTURE
#if NUM_BONE_INFLUENCERS>0
var influence : mat4x4<f32>;
#ifdef BONETEXTURE
influence=readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndices[0])*vertexInputs.matricesWeights[0];
#if NUM_BONE_INFLUENCERS>1
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndices[1])*vertexInputs.matricesWeights[1];
#endif 
#if NUM_BONE_INFLUENCERS>2
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndices[2])*vertexInputs.matricesWeights[2];
#endif 
#if NUM_BONE_INFLUENCERS>3
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndices[3])*vertexInputs.matricesWeights[3];
#endif 
#if NUM_BONE_INFLUENCERS>4
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndicesExtra[0])*vertexInputs.matricesWeightsExtra[0];
#endif 
#if NUM_BONE_INFLUENCERS>5
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndicesExtra[1])*vertexInputs.matricesWeightsExtra[1];
#endif 
#if NUM_BONE_INFLUENCERS>6
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndicesExtra[2])*vertexInputs.matricesWeightsExtra[2];
#endif 
#if NUM_BONE_INFLUENCERS>7
influence=influence+readMatrixFromRawSampler(boneSampler,vertexInputs.matricesIndicesExtra[3])*vertexInputs.matricesWeightsExtra[3];
#endif 
#else 
influence=uniforms.mBones[i32(vertexInputs.matricesIndices[0])]*vertexInputs.matricesWeights[0];
#if NUM_BONE_INFLUENCERS>1
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndices[1])]*vertexInputs.matricesWeights[1];
#endif 
#if NUM_BONE_INFLUENCERS>2
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndices[2])]*vertexInputs.matricesWeights[2];
#endif 
#if NUM_BONE_INFLUENCERS>3
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndices[3])]*vertexInputs.matricesWeights[3];
#endif 
#if NUM_BONE_INFLUENCERS>4
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndicesExtra[0])]*vertexInputs.matricesWeightsExtra[0];
#endif 
#if NUM_BONE_INFLUENCERS>5
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndicesExtra[1])]*vertexInputs.matricesWeightsExtra[1];
#endif 
#if NUM_BONE_INFLUENCERS>6
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndicesExtra[2])]*vertexInputs.matricesWeightsExtra[2];
#endif 
#if NUM_BONE_INFLUENCERS>7
influence=influence+uniforms.mBones[i32(vertexInputs.matricesIndicesExtra[3])]*vertexInputs.matricesWeightsExtra[3];
#endif 
#endif
finalWorld=finalWorld*influence;
#endif
#endif
`;e.IncludesShadersStoreWGSL[m]||(e.IncludesShadersStoreWGSL[m]=h);var g={name:m,shader:h},_=`clipPlaneVertex`,v=`#ifdef CLIPPLANE
vertexOutputs.fClipDistance=dot(worldPos,uniforms.vClipPlane);
#endif
#ifdef CLIPPLANE2
vertexOutputs.fClipDistance2=dot(worldPos,uniforms.vClipPlane2);
#endif
#ifdef CLIPPLANE3
vertexOutputs.fClipDistance3=dot(worldPos,uniforms.vClipPlane3);
#endif
#ifdef CLIPPLANE4
vertexOutputs.fClipDistance4=dot(worldPos,uniforms.vClipPlane4);
#endif
#ifdef CLIPPLANE5
vertexOutputs.fClipDistance5=dot(worldPos,uniforms.vClipPlane5);
#endif
#ifdef CLIPPLANE6
vertexOutputs.fClipDistance6=dot(worldPos,uniforms.vClipPlane6);
#endif
`;e.IncludesShadersStoreWGSL[_]||(e.IncludesShadersStoreWGSL[_]=v);var y={name:_,shader:v},b=`fogVertex`,x=`#ifdef FOG
#ifdef SCENE_UBO
vertexOutputs.vFogDistance=(scene.view*worldPos).xyz;
#else
vertexOutputs.vFogDistance=(uniforms.view*worldPos).xyz;
#endif
#endif
`;e.IncludesShadersStoreWGSL[b]||(e.IncludesShadersStoreWGSL[b]=x);var S={name:b,shader:x},C=`vertexColorMixing`,w=`#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
vertexOutputs.vColor=vec4f(1.0);
#ifdef VERTEXCOLOR
#ifdef VERTEXALPHA
vertexOutputs.vColor*=colorUpdated;
#else
vertexOutputs.vColor=vec4f(vertexOutputs.vColor.rgb*colorUpdated.rgb,vertexOutputs.vColor.a);
#endif
#endif
#ifdef INSTANCESCOLOR
vertexOutputs.vColor*=vertexInputs.instanceColor;
#endif
#endif
`;e.IncludesShadersStoreWGSL[C]||(e.IncludesShadersStoreWGSL[C]=w);var T={name:C,shader:w},E=`colorVertexShader`,D=`attribute position: vec3f;
#ifdef VERTEXCOLOR
attribute color: vec4f;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#ifdef FOG
uniform view: mat4x4f;
#endif
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vColor: vec4f;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
#ifdef VERTEXCOLOR
var colorUpdated: vec4f=vertexInputs.color;
#endif
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld* vec4f(vertexInputs.position,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#include<clipPlaneVertex>
#include<fogVertex>
#include<vertexColorMixing>
#define CUSTOM_VERTEX_MAIN_END
}`;e.ShadersStoreWGSL[E]||(e.ShadersStoreWGSL[E]=D);var O=[s,r,u,p,n,t,g,i,y,S,T];for(let t of O)e.IncludesShadersStoreWGSL[t.name]||(e.IncludesShadersStoreWGSL[t.name]=t.shader);var k={name:E,shader:D};export{k as colorVertexShaderWGSL};